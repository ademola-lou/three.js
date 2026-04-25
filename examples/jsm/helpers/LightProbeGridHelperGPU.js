import {
	InstancedBufferAttribute,
	InstancedMesh,
	Matrix4,
	MeshBasicNodeMaterial,
	SphereGeometry,
	Vector3
} from 'three/webgpu';

import { attribute, normalWorld } from 'three/tsl';

import { samplePackedLightProbeGridIrradiance } from '../lighting/LightProbeGridNode.js';

/**
 * WebGPU helper for visualizing a baked `LightProbeGridGPU`.
 *
 * @augments InstancedMesh
 * @three_import import { LightProbeGridHelper } from 'three/addons/helpers/LightProbeGridHelperGPU.js';
 */
class LightProbeGridHelper extends InstancedMesh {

	constructor( probes, sphereSize = 0.12 ) {

		const geometry = new SphereGeometry( sphereSize, 16, 16 );
		const material = new MeshBasicNodeMaterial();

		super( geometry, material, probes.resolution.x * probes.resolution.y * probes.resolution.z );

		this.probes = probes;
		this.type = 'LightProbeGridHelper';
		this.frustumCulled = false;

		this.update();

	}

	update() {

		const probes = this.probes;
		const res = probes.resolution;
		const count = res.x * res.y * res.z;

		if ( this.instanceMatrix.count !== count ) {

			this.instanceMatrix = new InstancedBufferAttribute( new Float32Array( count * 16 ), 16 );

		}

		this.count = count;

		const uvwArray = new Float32Array( count * 3 );
		const matrix = new Matrix4();
		const probePosition = new Vector3();

		let i = 0;

		for ( let iz = 0; iz < res.z; iz ++ ) {

			for ( let iy = 0; iy < res.y; iy ++ ) {

				for ( let ix = 0; ix < res.x; ix ++ ) {

					uvwArray[ i * 3 + 0 ] = ( ix + 0.5 ) / res.x;
					uvwArray[ i * 3 + 1 ] = ( iy + 0.5 ) / res.y;
					uvwArray[ i * 3 + 2 ] = ( iz + 0.5 ) / res.z;

					probes.getProbePosition( ix, iy, iz, probePosition );
					matrix.makeTranslation( probePosition.x, probePosition.y, probePosition.z );
					this.setMatrixAt( i, matrix );

					i ++;

				}

			}

		}

		this.instanceMatrix.needsUpdate = true;
		this.geometry.setAttribute( 'instanceUVW', new InstancedBufferAttribute( uvwArray, 3 ) );
		this.computeBoundingSphere();
		this.updateMatrixWorld( true );

		this.material.colorNode = samplePackedLightProbeGridIrradiance( probes, attribute( 'instanceUVW', 'vec3' ), normalWorld.normalize() );
		this.material.needsUpdate = true;

	}

	dispose() {

		this.geometry.dispose();
		this.material.dispose();

	}

}

export { LightProbeGridHelper };
