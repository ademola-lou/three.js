import {
	Box3,
	CubeCamera,
	CubeRenderTarget,
	Data3DTexture,
	FloatType,
	HalfFloatType,
	LinearFilter,
	Object3D,
	RGBAFormat,
	Vector3
} from 'three/webgpu';

import { LightProbeGenerator } from '../lights/LightProbeGenerator.js';

const _position = /*@__PURE__*/ new Vector3();
const _size = /*@__PURE__*/ new Vector3();

const ATLAS_PADDING = 1;
const ATLAS_TEXTURES = 7;

/**
 * A 3D grid of L2 spherical harmonic irradiance probes for WebGPU examples.
 *
 * Baking uses cubemap readback, so it is slower than the WebGL implementation,
 * but it produces the same packed atlas layout and can be sampled with a single
 * 3D texture in WebGPU shaders.
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

		const {
			cubemapSize = 16,
			near = 0.1,
			far = 100
		} = options;

		if ( renderer.init ) await renderer.init();

		this.updateBoundingBox();

		const res = this.resolution;
		const nx = res.x;
		const ny = res.y;
		const nz = res.z;
		const paddedSlices = nz + 2 * ATLAS_PADDING;
		const atlasDepth = ATLAS_TEXTURES * paddedSlices;
		const atlasData = new Float32Array( nx * ny * atlasDepth * 4 );

		const cubeRenderTarget = new CubeRenderTarget( cubemapSize, {
			type: HalfFloatType,
			format: RGBAFormat,
			generateMipmaps: false
		} );
		const cubeCamera = new CubeCamera( near, far, cubeRenderTarget );

		const wasVisible = this.visible;
		this.visible = false;

		for ( let iz = 0; iz < nz; iz ++ ) {

			for ( let iy = 0; iy < ny; iy ++ ) {

				for ( let ix = 0; ix < nx; ix ++ ) {

					this.getProbePosition( ix, iy, iz, _position );
					cubeCamera.position.copy( _position );
					cubeCamera.update( renderer, scene );

					const lightProbe = await LightProbeGenerator.fromCubeRenderTarget( renderer, cubeRenderTarget );
					_packProbe( atlasData, res, ix, iy, iz, lightProbe.sh.coefficients );

				}

			}

		}

		_copyPaddingSlices( atlasData, res );

		cubeRenderTarget.dispose();
		this.visible = wasVisible;

		if ( this.texture !== null ) this.texture.dispose();

		const texture = new Data3DTexture( atlasData, nx, ny, atlasDepth );
		texture.type = FloatType;
		texture.format = RGBAFormat;
		texture.minFilter = LinearFilter;
		texture.magFilter = LinearFilter;
		texture.generateMipmaps = false;
		texture.unpackAlignment = 1;
		texture.needsUpdate = true;

		this.texture = texture;

	}

	dispose() {

		if ( this.texture !== null ) {

			this.texture.dispose();
			this.texture = null;

		}

	}

}

function _packProbe( atlasData, resolution, ix, iy, iz, coefficients ) {

	const packed = [
		[ coefficients[ 0 ].x, coefficients[ 0 ].y, coefficients[ 0 ].z, coefficients[ 1 ].x ],
		[ coefficients[ 1 ].y, coefficients[ 1 ].z, coefficients[ 2 ].x, coefficients[ 2 ].y ],
		[ coefficients[ 2 ].z, coefficients[ 3 ].x, coefficients[ 3 ].y, coefficients[ 3 ].z ],
		[ coefficients[ 4 ].x, coefficients[ 4 ].y, coefficients[ 4 ].z, coefficients[ 5 ].x ],
		[ coefficients[ 5 ].y, coefficients[ 5 ].z, coefficients[ 6 ].x, coefficients[ 6 ].y ],
		[ coefficients[ 6 ].z, coefficients[ 7 ].x, coefficients[ 7 ].y, coefficients[ 7 ].z ],
		[ coefficients[ 8 ].x, coefficients[ 8 ].y, coefficients[ 8 ].z, 0 ]
	];

	const nx = resolution.x;
	const ny = resolution.y;
	const nz = resolution.z;
	const paddedSlices = nz + 2 * ATLAS_PADDING;

	for ( let textureIndex = 0; textureIndex < ATLAS_TEXTURES; textureIndex ++ ) {

		const atlasSlice = textureIndex * paddedSlices + ATLAS_PADDING + iz;
		const offset = _atlasOffset( ix, iy, atlasSlice, nx, ny );
		const value = packed[ textureIndex ];

		atlasData[ offset + 0 ] = value[ 0 ];
		atlasData[ offset + 1 ] = value[ 1 ];
		atlasData[ offset + 2 ] = value[ 2 ];
		atlasData[ offset + 3 ] = value[ 3 ];

	}

}

function _copyPaddingSlices( atlasData, resolution ) {

	const nx = resolution.x;
	const ny = resolution.y;
	const nz = resolution.z;
	const paddedSlices = nz + 2 * ATLAS_PADDING;

	for ( let textureIndex = 0; textureIndex < ATLAS_TEXTURES; textureIndex ++ ) {

		const paddingStart = textureIndex * paddedSlices;
		const firstDataSlice = paddingStart + ATLAS_PADDING;
		const lastDataSlice = paddingStart + ATLAS_PADDING + nz - 1;
		const paddingEnd = paddingStart + ATLAS_PADDING + nz;

		for ( let iy = 0; iy < ny; iy ++ ) {

			for ( let ix = 0; ix < nx; ix ++ ) {

				const firstOffset = _atlasOffset( ix, iy, firstDataSlice, nx, ny );
				const lastOffset = _atlasOffset( ix, iy, lastDataSlice, nx, ny );
				const startOffset = _atlasOffset( ix, iy, paddingStart, nx, ny );
				const endOffset = _atlasOffset( ix, iy, paddingEnd, nx, ny );

				for ( let channel = 0; channel < 4; channel ++ ) {

					atlasData[ startOffset + channel ] = atlasData[ firstOffset + channel ];
					atlasData[ endOffset + channel ] = atlasData[ lastOffset + channel ];

				}

			}

		}

	}

}

function _atlasOffset( x, y, z, width, height ) {

	return ( ( z * height + y ) * width + x ) * 4;

}

export { LightProbeGridGPU };
