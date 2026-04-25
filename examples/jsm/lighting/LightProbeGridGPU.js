import {
	Box3,
	Color,
	CubeCamera,
	CubeRenderTarget,
	DoubleSide,
	HalfFloatType,
	LinearFilter,
	NearestFilter,
	NodeMaterial,
	Object3D,
	QuadMesh,
	RenderTarget,
	RenderTarget3D,
	RGBAFormat,
	Vector3,
	Vector4
} from 'three/webgpu';

import { cameraPosition, cubeTexture, float, Fn, If, int, Loop, PI, positionWorld, screenCoordinate, texture, uniform, vec2, vec3, vec4 } from 'three/tsl';

const _position = /*@__PURE__*/ new Vector3();
const _size = /*@__PURE__*/ new Vector3();
const _savedViewport = /*@__PURE__*/ new Vector4();
const _savedScissor = /*@__PURE__*/ new Vector4();
const _whiteBackground = /*@__PURE__*/ new Color( 0xffffff );

let _quadMesh = null;
let _shMaterial = null;
let _shCubeMap = null;
let _lastCubemapSize = 0;
let _visibilityDepthMaterial = null;
let _visibilityMaterial = null;
let _visibilityCubeMap = null;
let _lastVisibilityCubemapSize = 0;
let _lastVisibilityFar = 0;
let _cubeRenderTarget = null;
let _cubeCamera = null;
let _cachedCubemapSize = 0;
let _cachedNear = 0;
let _cachedFar = 0;
let _batchTarget = null;
let _batchTargetProbes = 0;
let _visibilityBatchTarget = null;
let _visibilityBatchTargetProbes = 0;
let _repackMaterials = null;
let _visibilityRepackMaterial = null;

const ATLAS_PADDING = 1;
const ATLAS_TEXTURES = 7;

/**
 * A 3D grid of L2 spherical harmonic irradiance probes for WebGPU examples.
 *
 * Baking is GPU-resident: cubemap rendering, SH projection, and atlas repacking
 * all happen on the GPU with no per-probe CPU readback.
 *
 * @augments Object3D
 * @three_import import { LightProbeGridGPU } from 'three/addons/lighting/LightProbeGridGPU.js';
 */
class LightProbeGridGPU extends Object3D {

	constructor( width = 1, height = 1, depth = 1, widthProbes, heightProbes, depthProbes ) {

		super();

		this.isLightProbeGrid = true;
		this.isLightProbeGridGPU = true;

		this.width = width;
		this.height = height;
		this.depth = depth;

		this.resolution = new Vector3(
			widthProbes !== undefined ? widthProbes : Math.max( 2, Math.round( width ) + 1 ),
			heightProbes !== undefined ? heightProbes : Math.max( 2, Math.round( height ) + 1 ),
			depthProbes !== undefined ? depthProbes : Math.max( 2, Math.round( depth ) + 1 )
		);

		this.boundingBox = new Box3();
		this.texture = null;
		this.visibilityTexture = null;
		this.visibilityFar = 100;
		this.visibilityStrength = 0.35;
		this.visibilityDistance = 2.5;

		// World-space padding added to the grid's bounding box when classifying
		// fragments as "inside this volume" at runtime. A small positive value
		// covers wall / floor / ceiling fragments that sit just outside the
		// probe volume and would otherwise render with no indirect light.
		this.boundaryPadding = 0.25;

		this.updateBoundingBox();

	}

	getProbePosition( ix, iy, iz, target ) {

		const pos = this.position;
		const res = this.resolution;
		const w = this.width, h = this.height, d = this.depth;

		target.set(
			res.x > 1 ? pos.x - w / 2 + ix * w / ( res.x - 1 ) : pos.x,
			res.y > 1 ? pos.y - h / 2 + iy * h / ( res.y - 1 ) : pos.y,
			res.z > 1 ? pos.z - d / 2 + iz * d / ( res.z - 1 ) : pos.z
		);

		return target;

	}

	updateBoundingBox() {

		_size.set( this.width, this.height, this.depth );
		this.boundingBox.setFromCenterAndSize( this.position, _size );

	}

	async bake( renderer, scene, options = {} ) {

		if ( renderer.init ) await renderer.init();

		const { far = 100 } = options;
		const { cubeCamera } = _ensureBakeResources( options );

		this._ensureTextures();
		this.updateBoundingBox();
		this.visibilityFar = far;

		const res = this.resolution;
		const totalProbes = res.x * res.y * res.z;
		const batchTarget = _ensureBatchTarget( totalProbes );
		const visibilityBatchTarget = _ensureVisibilityBatchTarget( totalProbes );

		const wasVisible = this.visible;
		this.visible = false;

		const savedRenderTarget = renderer.getRenderTarget();
		renderer.getViewport( _savedViewport );
		renderer.getScissor( _savedScissor );
		const savedScissorTest = renderer.getScissorTest();
		const savedShadowAutoUpdate = renderer.shadowMap.autoUpdate;
		const savedOverrideMaterial = scene.overrideMaterial;
		const savedBackground = scene.background;

		renderer.shadowMap.autoUpdate = false;
		renderer.shadowMap.needsUpdate = true;

		renderer.setRenderTarget( batchTarget );
		renderer.setViewport( 0, 0, 9, totalProbes );
		renderer.setScissor( 0, 0, 9, totalProbes );
		renderer.setScissorTest( false );
		renderer.clear();

		renderer.setRenderTarget( visibilityBatchTarget );
		renderer.setViewport( 0, 0, 1, totalProbes );
		renderer.setScissor( 0, 0, 1, totalProbes );
		renderer.setScissorTest( false );
		renderer.clear();

		batchTarget.scissorTest = true;
		visibilityBatchTarget.scissorTest = true;

		for ( let iz = 0; iz < res.z; iz ++ ) {

			for ( let iy = 0; iy < res.y; iy ++ ) {

				for ( let ix = 0; ix < res.x; ix ++ ) {

					const probeIndex = ix + iy * res.x + iz * res.x * res.y;

					this.getProbePosition( ix, iy, iz, _position );
					cubeCamera.position.copy( _position );

					_quadMesh.material = _shMaterial;
					cubeCamera.update( renderer, scene );

					renderer.setRenderTarget( batchTarget );
					renderer.setViewport( 0, probeIndex, 9, 1 );
					renderer.setScissor( 0, probeIndex, 9, 1 );
					renderer.setScissorTest( true );
					_quadMesh.render( renderer );

					scene.overrideMaterial = _visibilityDepthMaterial;
					scene.background = _whiteBackground;
					_quadMesh.material = _visibilityMaterial;
					cubeCamera.update( renderer, scene );
					scene.overrideMaterial = savedOverrideMaterial;
					scene.background = savedBackground;

					renderer.setRenderTarget( visibilityBatchTarget );
					renderer.setViewport( 0, probeIndex, 1, 1 );
					renderer.setScissor( 0, probeIndex, 1, 1 );
					renderer.setScissorTest( true );
					_quadMesh.render( renderer );

				}

			}

		}

		renderer.shadowMap.autoUpdate = savedShadowAutoUpdate;

		const paddedSlices = res.z + 2 * ATLAS_PADDING;
		const atlasTarget = this._renderTarget;
		const visibilityTarget = this._visibilityRenderTarget;

		_ensureRepackResources( batchTarget.texture, totalProbes, res );
		_ensureVisibilityRepackResource( visibilityBatchTarget.texture, totalProbes, res );

		renderer.setViewport( 0, 0, res.x, res.y );
		renderer.setScissor( 0, 0, res.x, res.y );
		renderer.setScissorTest( false );

		for ( let textureIndex = 0; textureIndex < ATLAS_TEXTURES; textureIndex ++ ) {

			const material = _repackMaterials[ textureIndex ];
			material.userData.sliceZ.value = 0;
			_quadMesh.material = material;

			renderer.setRenderTarget( atlasTarget, textureIndex * paddedSlices );
			renderer.clear();
			_quadMesh.render( renderer );

			for ( let iz = 0; iz < res.z; iz ++ ) {

				material.userData.sliceZ.value = iz;

				renderer.setRenderTarget( atlasTarget, textureIndex * paddedSlices + ATLAS_PADDING + iz );
				renderer.clear();
				_quadMesh.render( renderer );

			}

			material.userData.sliceZ.value = res.z - 1;

			renderer.setRenderTarget( atlasTarget, textureIndex * paddedSlices + ATLAS_PADDING + res.z );
			renderer.clear();
			_quadMesh.render( renderer );

		}

		_visibilityRepackMaterial.userData.sliceZ.value = 0;
		_quadMesh.material = _visibilityRepackMaterial;

		renderer.setRenderTarget( visibilityTarget, 0 );
		renderer.clear();
		_quadMesh.render( renderer );

		for ( let iz = 0; iz < res.z; iz ++ ) {

			_visibilityRepackMaterial.userData.sliceZ.value = iz;

			renderer.setRenderTarget( visibilityTarget, ATLAS_PADDING + iz );
			renderer.clear();
			_quadMesh.render( renderer );

		}

		_visibilityRepackMaterial.userData.sliceZ.value = res.z - 1;

		renderer.setRenderTarget( visibilityTarget, ATLAS_PADDING + res.z );
		renderer.clear();
		_quadMesh.render( renderer );

		renderer.setRenderTarget( savedRenderTarget );
		renderer.setViewport( _savedViewport );
		renderer.setScissor( _savedScissor );
		renderer.setScissorTest( savedScissorTest );
		scene.overrideMaterial = savedOverrideMaterial;
		scene.background = savedBackground;

		this.visible = wasVisible;

	}

	_ensureTextures() {

		if ( this._renderTarget !== undefined && this._renderTarget !== null ) return;

		const res = this.resolution;
		const atlasDepth = ATLAS_TEXTURES * ( res.z + 2 * ATLAS_PADDING );

		const renderTarget = new RenderTarget3D( res.x, res.y, atlasDepth, {
			format: RGBAFormat,
			type: HalfFloatType,
			minFilter: LinearFilter,
			magFilter: LinearFilter,
			generateMipmaps: false,
			depthBuffer: false
		} );

		this._renderTarget = renderTarget;
		this.texture = renderTarget.texture;

		const visibilityRenderTarget = new RenderTarget3D( res.x, res.y, res.z + 2 * ATLAS_PADDING, {
			format: RGBAFormat,
			type: HalfFloatType,
			minFilter: LinearFilter,
			magFilter: LinearFilter,
			generateMipmaps: false,
			depthBuffer: false
		} );

		this._visibilityRenderTarget = visibilityRenderTarget;
		this.visibilityTexture = visibilityRenderTarget.texture;

	}

	dispose() {

		if ( this._renderTarget !== undefined && this._renderTarget !== null ) {

			this._renderTarget.dispose();
			this._renderTarget = null;
			this.texture = null;

		}

		if ( this._visibilityRenderTarget !== undefined && this._visibilityRenderTarget !== null ) {

			this._visibilityRenderTarget.dispose();
			this._visibilityRenderTarget = null;
			this.visibilityTexture = null;

		}

	}

}

function _ensureQuadMesh() {

	if ( _quadMesh === null ) {

		_quadMesh = new QuadMesh();

	}

}

function _ensureBakeResources( options ) {

	const {
		cubemapSize = 16,
		near = 0.1,
		far = 100
	} = options;

	if ( _cubeRenderTarget === null || cubemapSize !== _cachedCubemapSize || near !== _cachedNear || far !== _cachedFar ) {

		if ( _cubeRenderTarget !== null ) _cubeRenderTarget.dispose();

		_cubeRenderTarget = new CubeRenderTarget( cubemapSize, {
			type: HalfFloatType,
			format: RGBAFormat,
			generateMipmaps: false
		} );
		_cubeCamera = new CubeCamera( near, far, _cubeRenderTarget );

		_cachedCubemapSize = cubemapSize;
		_cachedNear = near;
		_cachedFar = far;

	}

	_ensureQuadMesh();
	_ensureSHMaterial( cubemapSize, _cubeRenderTarget.texture );
	_ensureVisibilityMaterials( cubemapSize, _cubeRenderTarget.texture, far );

	return { cubeRenderTarget: _cubeRenderTarget, cubeCamera: _cubeCamera };

}

function _ensureVisibilityMaterials( cubemapSize, cubeMap, far ) {

	if ( _visibilityDepthMaterial === null || _lastVisibilityFar !== far ) {

		if ( _visibilityDepthMaterial !== null ) _visibilityDepthMaterial.dispose();

		const normalizedDistance = cameraPosition.sub( positionWorld ).length().div( far ).clamp( 0, 1 );

		_visibilityDepthMaterial = new NodeMaterial();
		_visibilityDepthMaterial.depthTest = true;
		_visibilityDepthMaterial.depthWrite = true;
		_visibilityDepthMaterial.side = DoubleSide;
		_visibilityDepthMaterial.toneMapped = false;
		_visibilityDepthMaterial.outputNode = vec4( normalizedDistance, normalizedDistance.mul( normalizedDistance ), 1, 1 );

		_lastVisibilityFar = far;

	}

	if ( _visibilityMaterial !== null && _lastVisibilityCubemapSize === cubemapSize && _visibilityCubeMap === cubeMap ) return;

	if ( _visibilityMaterial !== null ) _visibilityMaterial.dispose();

	const envMap = cubeTexture( cubeMap );
	const pixelSize = float( 2 / cubemapSize );

	const projectVisibility = Fn( () => {

		const accum = vec3( 0 ).toVar();
		const totalWeight = float( 0 ).toVar();

		Loop( { start: 0, end: 6, name: 'face' }, ( { face } ) => {

			Loop( { start: 0, end: cubemapSize, name: 'iy' }, ( { iy } ) => {

				Loop( { start: 0, end: cubemapSize, name: 'ix' }, ( { ix } ) => {

					const col = float( ix ).add( 0.5 ).mul( pixelSize ).sub( 1 );
					const row = float( 1 ).sub( float( iy ).add( 0.5 ).mul( pixelSize ) );
					const coord = vec3( 0 ).toVar();

					If( face.equal( int( 0 ) ), () => {

						coord.assign( vec3( 1, row, col.negate() ) );

					} ).ElseIf( face.equal( int( 1 ) ), () => {

						coord.assign( vec3( - 1, row, col ) );

					} ).ElseIf( face.equal( int( 2 ) ), () => {

						coord.assign( vec3( col, 1, row.negate() ) );

					} ).ElseIf( face.equal( int( 3 ) ), () => {

						coord.assign( vec3( col, - 1, row ) );

					} ).ElseIf( face.equal( int( 4 ) ), () => {

						coord.assign( vec3( col, row, 1 ) );

					} ).Else( () => {

						coord.assign( vec3( col.negate(), row, - 1 ) );

					} );

					const lengthSq = coord.dot( coord );
					const weight = float( 4 ).div( lengthSq.sqrt().mul( lengthSq ) );
					const moments = envMap.sample( coord ).rgb;

					totalWeight.addAssign( weight );
					accum.addAssign( moments.mul( weight ) );

				} );

			} );

		} );

		return vec4( accum.div( totalWeight ), 1 );

	} );

	_visibilityMaterial = new NodeMaterial();
	_visibilityMaterial.depthTest = false;
	_visibilityMaterial.depthWrite = false;
	_visibilityMaterial.toneMapped = false;
	_visibilityMaterial.outputNode = projectVisibility();

	_lastVisibilityCubemapSize = cubemapSize;
	_visibilityCubeMap = cubeMap;

}

function _ensureSHMaterial( cubemapSize, cubeMap ) {

	if ( _shMaterial !== null && _lastCubemapSize === cubemapSize && _shCubeMap === cubeMap ) return;

	if ( _shMaterial !== null ) _shMaterial.dispose();

	const envMap = cubeTexture( cubeMap );
	const pixelSize = float( 2 / cubemapSize );

	const projectSH = Fn( () => {

		const coefficientIndex = int( screenCoordinate.x );

		const accum0 = vec3( 0 ).toVar();
		const accum1 = vec3( 0 ).toVar();
		const accum2 = vec3( 0 ).toVar();
		const accum3 = vec3( 0 ).toVar();
		const accum4 = vec3( 0 ).toVar();
		const accum5 = vec3( 0 ).toVar();
		const accum6 = vec3( 0 ).toVar();
		const accum7 = vec3( 0 ).toVar();
		const accum8 = vec3( 0 ).toVar();
		const totalWeight = float( 0 ).toVar();

		Loop( { start: 0, end: 6, name: 'face' }, ( { face } ) => {

			Loop( { start: 0, end: cubemapSize, name: 'iy' }, ( { iy } ) => {

				Loop( { start: 0, end: cubemapSize, name: 'ix' }, ( { ix } ) => {

					// Match the WebGL bake: col in [-1, 1] left-to-right, row in [1, -1] top-to-bottom.
					const col = float( ix ).add( 0.5 ).mul( pixelSize ).sub( 1 );
					const row = float( 1 ).sub( float( iy ).add( 0.5 ).mul( pixelSize ) );
					const coord = vec3( 0 ).toVar();

					If( face.equal( int( 0 ) ), () => {

						coord.assign( vec3( 1, row, col.negate() ) );

					} ).ElseIf( face.equal( int( 1 ) ), () => {

						coord.assign( vec3( - 1, row, col ) );

					} ).ElseIf( face.equal( int( 2 ) ), () => {

						coord.assign( vec3( col, 1, row.negate() ) );

					} ).ElseIf( face.equal( int( 3 ) ), () => {

						coord.assign( vec3( col, - 1, row ) );

					} ).ElseIf( face.equal( int( 4 ) ), () => {

						coord.assign( vec3( col, row, 1 ) );

					} ).Else( () => {

						coord.assign( vec3( col.negate(), row, - 1 ) );

					} );

					const lengthSq = coord.dot( coord );
					const weight = float( 4 ).div( lengthSq.sqrt().mul( lengthSq ) );
					const dir = coord.normalize();
					// `cubeTexture().sample()` already abstracts the WebGL/WebGPU cube convention,
					// so we sample with the raw world-space direction (matches the WebGL bake).
					const color = envMap.sample( coord ).rgb.mul( weight );

					totalWeight.addAssign( weight );

					accum0.addAssign( color.mul( 0.282095 ) );
					accum1.addAssign( color.mul( 0.488603 ).mul( dir.y ) );
					accum2.addAssign( color.mul( 0.488603 ).mul( dir.z ) );
					accum3.addAssign( color.mul( 0.488603 ).mul( dir.x ) );
					accum4.addAssign( color.mul( 1.092548 ).mul( dir.x ).mul( dir.y ) );
					accum5.addAssign( color.mul( 1.092548 ).mul( dir.y ).mul( dir.z ) );
					accum6.addAssign( color.mul( 0.315392 ).mul( dir.z.mul( dir.z ).mul( 3 ).sub( 1 ) ) );
					accum7.addAssign( color.mul( 1.092548 ).mul( dir.x ).mul( dir.z ) );
					accum8.addAssign( color.mul( 0.546274 ).mul( dir.x.mul( dir.x ).sub( dir.y.mul( dir.y ) ) ) );

				} );

			} );

		} );

		const accum = vec3( 0 ).toVar();

		If( coefficientIndex.equal( int( 0 ) ), () => {

			accum.assign( accum0 );

		} ).ElseIf( coefficientIndex.equal( int( 1 ) ), () => {

			accum.assign( accum1 );

		} ).ElseIf( coefficientIndex.equal( int( 2 ) ), () => {

			accum.assign( accum2 );

		} ).ElseIf( coefficientIndex.equal( int( 3 ) ), () => {

			accum.assign( accum3 );

		} ).ElseIf( coefficientIndex.equal( int( 4 ) ), () => {

			accum.assign( accum4 );

		} ).ElseIf( coefficientIndex.equal( int( 5 ) ), () => {

			accum.assign( accum5 );

		} ).ElseIf( coefficientIndex.equal( int( 6 ) ), () => {

			accum.assign( accum6 );

		} ).ElseIf( coefficientIndex.equal( int( 7 ) ), () => {

			accum.assign( accum7 );

		} ).Else( () => {

			accum.assign( accum8 );

		} );

		const norm = float( 4 ).mul( PI ).div( totalWeight );

		return vec4( accum.mul( norm ), 1 );

	} );

	_shMaterial = new NodeMaterial();
	_shMaterial.depthTest = false;
	_shMaterial.depthWrite = false;
	_shMaterial.toneMapped = false;
	_shMaterial.outputNode = projectSH();

	_lastCubemapSize = cubemapSize;
	_shCubeMap = cubeMap;

}

function _ensureBatchTarget( totalProbes ) {

	if ( _batchTarget === null || _batchTargetProbes !== totalProbes ) {

		if ( _batchTarget !== null ) _batchTarget.dispose();

		_batchTarget = new RenderTarget( 9, totalProbes, {
			format: RGBAFormat,
			type: HalfFloatType,
			minFilter: NearestFilter,
			magFilter: NearestFilter,
			depthBuffer: false
		} );
		_batchTargetProbes = totalProbes;

		if ( _repackMaterials !== null ) {

			for ( const material of _repackMaterials ) material.dispose();
			_repackMaterials = null;

		}

	}

	return _batchTarget;

}

function _ensureVisibilityBatchTarget( totalProbes ) {

	if ( _visibilityBatchTarget === null || _visibilityBatchTargetProbes !== totalProbes ) {

		if ( _visibilityBatchTarget !== null ) _visibilityBatchTarget.dispose();

		_visibilityBatchTarget = new RenderTarget( 1, totalProbes, {
			format: RGBAFormat,
			type: HalfFloatType,
			minFilter: NearestFilter,
			magFilter: NearestFilter,
			depthBuffer: false
		} );
		_visibilityBatchTargetProbes = totalProbes;

		if ( _visibilityRepackMaterial !== null ) {

			_visibilityRepackMaterial.dispose();
			_visibilityRepackMaterial = null;

		}

	}

	return _visibilityBatchTarget;

}

function _ensureRepackResources( batchTexture, totalProbes, resolution ) {

	if ( _repackMaterials !== null ) {

		for ( const material of _repackMaterials ) {

			material.userData.probesResolution.value.copy( resolution );

		}

		return;

	}

	const batchTextureNode = texture( batchTexture );
	const probesResolution = uniform( resolution.clone() );
	const sliceZ = uniform( 0 );

	_repackMaterials = [];

	for ( let textureIndex = 0; textureIndex < ATLAS_TEXTURES; textureIndex ++ ) {

		const repackSH = Fn( () => {

			const ix = int( screenCoordinate.x );
			const iy = int( screenCoordinate.y );
			const iz = int( sliceZ );
			const resolution = probesResolution;
			const probeIndex = ix.add( iy.mul( int( resolution.x ) ) ).add( iz.mul( int( resolution.x ) ).mul( int( resolution.y ) ) );

			const readCoefficient = ( index ) => batchTextureNode.sample( vec2(
				float( index + 0.5 ).div( 9 ),
				float( probeIndex ).add( 0.5 ).div( totalProbes )
			) );

			const c0 = readCoefficient( 0 );
			const c1 = readCoefficient( 1 );
			const c2 = readCoefficient( 2 );
			const c3 = readCoefficient( 3 );
			const c4 = readCoefficient( 4 );
			const c5 = readCoefficient( 5 );
			const c6 = readCoefficient( 6 );
			const c7 = readCoefficient( 7 );
			const c8 = readCoefficient( 8 );

			if ( textureIndex === 0 ) return vec4( c0.rgb, c1.r );
			if ( textureIndex === 1 ) return vec4( c1.g, c1.b, c2.r, c2.g );
			if ( textureIndex === 2 ) return vec4( c2.b, c3.r, c3.g, c3.b );
			if ( textureIndex === 3 ) return vec4( c4.rgb, c5.r );
			if ( textureIndex === 4 ) return vec4( c5.g, c5.b, c6.r, c6.g );
			if ( textureIndex === 5 ) return vec4( c6.b, c7.r, c7.g, c7.b );

			return vec4( c8.rgb, 0 );

		} );

		const material = new NodeMaterial();
		material.depthTest = false;
		material.depthWrite = false;
		material.toneMapped = false;
		material.outputNode = repackSH();
		material.userData.sliceZ = sliceZ;
		material.userData.probesResolution = probesResolution;

		_repackMaterials.push( material );

	}

}

function _ensureVisibilityRepackResource( batchTexture, totalProbes, resolution ) {

	if ( _visibilityRepackMaterial !== null ) {

		_visibilityRepackMaterial.userData.probesResolution.value.copy( resolution );
		return;

	}

	const batchTextureNode = texture( batchTexture );
	const probesResolution = uniform( resolution.clone() );
	const sliceZ = uniform( 0 );

	const repackVisibility = Fn( () => {

		const ix = int( screenCoordinate.x );
		const iy = int( screenCoordinate.y );
		const iz = int( sliceZ );
		const resolution = probesResolution;
		const probeIndex = ix.add( iy.mul( int( resolution.x ) ) ).add( iz.mul( int( resolution.x ) ).mul( int( resolution.y ) ) );

		return batchTextureNode.sample( vec2(
			0.5,
			float( probeIndex ).add( 0.5 ).div( totalProbes )
		) );

	} );

	_visibilityRepackMaterial = new NodeMaterial();
	_visibilityRepackMaterial.depthTest = false;
	_visibilityRepackMaterial.depthWrite = false;
	_visibilityRepackMaterial.toneMapped = false;
	_visibilityRepackMaterial.outputNode = repackVisibility();
	_visibilityRepackMaterial.userData.sliceZ = sliceZ;
	_visibilityRepackMaterial.userData.probesResolution = probesResolution;

}
export { LightProbeGridGPU };
