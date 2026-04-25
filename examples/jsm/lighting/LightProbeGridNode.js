import { Data3DTexture, HalfFloatType, LightingNode, LinearFilter, RGBAFormat } from 'three/webgpu';
import { float, normalWorld, positionWorld, texture3D, uniform, vec3 } from 'three/tsl';

const _emptyProbeTexture = /*@__PURE__*/ new Data3DTexture( new Uint16Array( 4 ), 1, 1, 1 );
_emptyProbeTexture.type = HalfFloatType;
_emptyProbeTexture.format = RGBAFormat;
_emptyProbeTexture.minFilter = LinearFilter;
_emptyProbeTexture.magFilter = LinearFilter;
_emptyProbeTexture.generateMipmaps = false;
_emptyProbeTexture.unpackAlignment = 1;
_emptyProbeTexture.needsUpdate = true;

function samplePackedLightProbeGridIrradiance( probes, uvw, sampleNormal ) {

	const probesSH = texture3D( probes.texture || _emptyProbeTexture );
	const probesResolution = uniform( probes.resolution.clone() );

	const nz = probesResolution.z;
	const paddedSlices = nz.add( 2 );
	const atlasDepth = paddedSlices.mul( 7 );
	const uvZBase = uvw.z.mul( nz ).add( 1 );

	const uvx = uvw.x;
	const uvy = uvw.y;

	const s0 = probesSH.sample( vec3( uvx, uvy, uvZBase.div( atlasDepth ) ) );
	const s1 = probesSH.sample( vec3( uvx, uvy, uvZBase.add( paddedSlices ).div( atlasDepth ) ) );
	const s2 = probesSH.sample( vec3( uvx, uvy, uvZBase.add( paddedSlices.mul( 2 ) ).div( atlasDepth ) ) );
	const s3 = probesSH.sample( vec3( uvx, uvy, uvZBase.add( paddedSlices.mul( 3 ) ).div( atlasDepth ) ) );
	const s4 = probesSH.sample( vec3( uvx, uvy, uvZBase.add( paddedSlices.mul( 4 ) ).div( atlasDepth ) ) );
	const s5 = probesSH.sample( vec3( uvx, uvy, uvZBase.add( paddedSlices.mul( 5 ) ).div( atlasDepth ) ) );
	const s6 = probesSH.sample( vec3( uvx, uvy, uvZBase.add( paddedSlices.mul( 6 ) ).div( atlasDepth ) ) );

	const c0 = s0.xyz;
	const c1 = vec3( s0.w, s1.x, s1.y );
	const c2 = vec3( s1.z, s1.w, s2.x );
	const c3 = s2.yzw;
	const c4 = s3.xyz;
	const c5 = vec3( s3.w, s4.x, s4.y );
	const c6 = vec3( s4.z, s4.w, s5.x );
	const c7 = s5.yzw;
	const c8 = s6.xyz;

	const x = sampleNormal.x;
	const y = sampleNormal.y;
	const z = sampleNormal.z;

	let result = c0.mul( 0.886227 );

	result = result.add( c1.mul( 2.0 * 0.511664 ).mul( y ) );
	result = result.add( c2.mul( 2.0 * 0.511664 ).mul( z ) );
	result = result.add( c3.mul( 2.0 * 0.511664 ).mul( x ) );
	result = result.add( c4.mul( 2.0 * 0.429043 ).mul( x ).mul( y ) );
	result = result.add( c5.mul( 2.0 * 0.429043 ).mul( y ).mul( z ) );
	result = result.add( c6.mul( z.mul( z ).mul( 0.743125 ).sub( 0.247708 ) ) );
	result = result.add( c7.mul( 2.0 * 0.429043 ).mul( x ).mul( z ) );
	result = result.add( c8.mul( x.mul( x ).sub( y.mul( y ) ).mul( 0.429043 ) ) );

	return result.max( vec3( 0 ) );

}

function sampleLightProbeGridIrradiance( probes, samplePosition, sampleNormal ) {

	const probesMin = uniform( probes.boundingBox.min.clone() );
	const probesMax = uniform( probes.boundingBox.max.clone() );
	const probesResolution = uniform( probes.resolution.clone() );

	const gridRange = probesMax.sub( probesMin );
	const resMinusOne = probesResolution.sub( 1 );
	const probeSpacing = gridRange.div( resMinusOne );

	// Bias the sample a half-spacing into the volume along the normal. This is what
	// gets used for the actual SH lookup.
	const offsetPosition = samplePosition.add( sampleNormal.mul( probeSpacing ).mul( 0.5 ) );
	const localUVW = offsetPosition.sub( probesMin ).div( gridRange );

	// Inflate the volume's bounding box by a small padding on every axis so that
	// wall / floor / ceiling / corner fragments that sit just outside the volume on
	// one or more axes are still claimed by this grid. Without this, surfaces like
	// the bottom edge of a divider wall (whose Y is below `probesMin.y` and whose
	// normal-along offset only moves X) fall outside on Y and render black.
	//
	// `probes.boundaryPadding` lets the user tune this per-grid. The default is
	// small enough to cover typical wall-volume gaps without producing an obvious
	// double-bright strip where two adjacent grids share a boundary.
	const padding = uniform( probes.boundaryPadding !== undefined ? probes.boundaryPadding : 0.25 );
	const paddedMin = probesMin.sub( padding );
	const paddedMax = probesMax.add( padding );

	const inside = samplePosition.x.greaterThanEqual( paddedMin.x )
		.and( samplePosition.x.lessThan( paddedMax.x ) )
		.and( samplePosition.y.greaterThanEqual( paddedMin.y ) )
		.and( samplePosition.y.lessThan( paddedMax.y ) )
		.and( samplePosition.z.greaterThanEqual( paddedMin.z ) )
		.and( samplePosition.z.lessThan( paddedMax.z ) );

	const uvw = localUVW.clamp( 0, 1 ).mul( resMinusOne ).div( probesResolution ).add( float( 0.5 ).div( probesResolution ) );

	const irradiance = samplePackedLightProbeGridIrradiance( probes, uvw, sampleNormal );

	return inside.select( irradiance, vec3( 0 ) );

}

/**
 * Lighting node that injects irradiance from a baked `LightProbeGridGPU`.
 *
 * @augments LightingNode
 * @three_import import { LightProbeGridNode } from 'three/addons/lighting/LightProbeGridNode.js';
 */
class LightProbeGridNode extends LightingNode {

	constructor( probes ) {

		super();

		this.probes = probes;

	}

	setup( builder ) {

		const irradiance = sampleLightProbeGridIrradiance( this.probes, positionWorld, normalWorld.normalize() );
		builder.context.irradiance.addAssign( irradiance );

	}

}

export { LightProbeGridNode, sampleLightProbeGridIrradiance, samplePackedLightProbeGridIrradiance };
