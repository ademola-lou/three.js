import {
	Box3,
	LightProbe,
	MathUtils,
	Vector3
} from 'three';

const _cellSpace = new Vector3();
const _probePosition = new Vector3();
const _samplePosition = new Vector3();
const _sampleToProbe = new Vector3();

/**
 * Probe grid utility for interpolating light probe data in a 3D volume.
 *
 * @three_import import { ProbeGrid } from 'three/addons/lights/ProbeGrid.js';
 */
class ProbeGrid {

	/**
	 * Constructs a probe grid.
	 *
	 * @param {Box3} bounds - Spatial bounds of the grid.
	 * @param {Vector3} divisions - Probe counts in each axis. Each component must be >= 1.
	 */
	constructor(
		bounds = new Box3( new Vector3( - 5, 0, - 5 ), new Vector3( 5, 5, 5 ) ),
		divisions = new Vector3( 3, 2, 3 )
	) {

		/**
		 * Spatial bounds covered by the grid.
		 *
		 * @type {Box3}
		 */
		this.bounds = bounds.clone();

		/**
		 * Probe count per axis.
		 *
		 * @type {Vector3}
		 */
		this.divisions = divisions.clone().floor().max( new Vector3( 1, 1, 1 ) );

		/**
		 * The probe storage.
		 *
		 * @type {Array<LightProbe>}
		 */
		this.probes = [];

		const probeCount = this.divisions.x * this.divisions.y * this.divisions.z;

		for ( let i = 0; i < probeCount; i ++ ) {

			this.probes.push( new LightProbe() );

		}

	}

	/**
	 * Returns the flat probe index for a grid coordinate.
	 *
	 * @param {number} x - Grid coordinate.
	 * @param {number} y - Grid coordinate.
	 * @param {number} z - Grid coordinate.
	 * @return {number} Flat probe index.
	 */
	getIndex( x, y, z ) {

		const sx = this.divisions.x;
		const sy = this.divisions.y;
		const sz = this.divisions.z;

		const ix = MathUtils.clamp( Math.floor( x ), 0, sx - 1 );
		const iy = MathUtils.clamp( Math.floor( y ), 0, sy - 1 );
		const iz = MathUtils.clamp( Math.floor( z ), 0, sz - 1 );

		return ix + iy * sx + iz * sx * sy;

	}

	/**
	 * Returns a probe at a specific grid coordinate.
	 *
	 * @param {number} x - Grid coordinate.
	 * @param {number} y - Grid coordinate.
	 * @param {number} z - Grid coordinate.
	 * @return {LightProbe} Probe.
	 */
	getProbeAt( x, y, z ) {

		return this.probes[ this.getIndex( x, y, z ) ];

	}

	/**
	 * Sets a probe at a specific grid coordinate.
	 *
	 * @param {number} x - Grid coordinate.
	 * @param {number} y - Grid coordinate.
	 * @param {number} z - Grid coordinate.
	 * @param {LightProbe} probe - Source probe.
	 * @return {ProbeGrid} A reference to this probe grid.
	 */
	setProbeAt( x, y, z, probe ) {

		this.getProbeAt( x, y, z ).copy( probe );
		return this;

	}

	/**
	 * Returns the world-space position of a probe coordinate.
	 *
	 * @param {number} x - Grid coordinate.
	 * @param {number} y - Grid coordinate.
	 * @param {number} z - Grid coordinate.
	 * @param {Vector3} [target] - Target position vector.
	 * @return {Vector3} Probe position.
	 */
	getProbePositionAt( x, y, z, target = new Vector3() ) {

		const sx = this.divisions.x;
		const sy = this.divisions.y;
		const sz = this.divisions.z;

		const nx = sx === 1 ? 0 : x / ( sx - 1 );
		const ny = sy === 1 ? 0 : y / ( sy - 1 );
		const nz = sz === 1 ? 0 : z / ( sz - 1 );

		target.set(
			MathUtils.lerp( this.bounds.min.x, this.bounds.max.x, nx ),
			MathUtils.lerp( this.bounds.min.y, this.bounds.max.y, ny ),
			MathUtils.lerp( this.bounds.min.z, this.bounds.max.z, nz )
		);

		return target;

	}

	/**
	 * Iterates all probes and invokes a callback for each item.
	 *
	 * @param {(probe: LightProbe, position: Vector3, index: number, x: number, y: number, z: number) => void} callback - Iteration callback.
	 */
	forEachProbe( callback ) {

		const sx = this.divisions.x;
		const sy = this.divisions.y;
		const sz = this.divisions.z;

		let index = 0;

		for ( let z = 0; z < sz; z ++ ) {

			for ( let y = 0; y < sy; y ++ ) {

				for ( let x = 0; x < sx; x ++ ) {

					const probe = this.probes[ index ];
					this.getProbePositionAt( x, y, z, _probePosition );
					callback( probe, _probePosition, index, x, y, z );
					index ++;

				}

			}

		}

	}

	/**
	 * Samples the probe grid at a world-space position via trilinear interpolation.
	 *
	 * @param {Vector3} position - Position in world-space.
	 * @param {LightProbe} [target] - Probe that receives the sampled data.
	 * @param {Object} [options={}] - Sampling options.
	 * @param {Vector3?} [options.normal=null] - Shading normal for geometric weighting.
	 * @param {Vector3?} [options.viewDirection=null] - View direction for view bias.
	 * @param {number} [options.normalBias=0] - Offset along normal before sampling.
	 * @param {number} [options.viewBias=0] - Offset along view direction before sampling.
	 * @param {boolean} [options.geometricWeighting=false] - Enable normal-based probe weighting.
	 * @param {number} [options.geometricPower=1] - Exponent for geometric weighting.
	 * @return {LightProbe} Sampled probe.
	 */
	sample( position, target = new LightProbe(), options = {} ) {

		const {
			normal = null,
			viewDirection = null,
			normalBias = 0,
			viewBias = 0,
			geometricWeighting = false,
			geometricPower = 1
		} = options;

		const sx = this.divisions.x;
		const sy = this.divisions.y;
		const sz = this.divisions.z;

		_samplePosition.copy( position );

		if ( normal !== null && normalBias !== 0 ) {

			_samplePosition.addScaledVector( normal, normalBias );

		}

		if ( viewDirection !== null && viewBias !== 0 ) {

			_samplePosition.addScaledVector( viewDirection, viewBias );

		}

		_cellSpace.copy( _samplePosition );
		this.bounds.clampPoint( _cellSpace, _cellSpace );
		this.bounds.getParameter( _cellSpace, _cellSpace );

		_cellSpace.set(
			_cellSpace.x * ( sx - 1 ),
			_cellSpace.y * ( sy - 1 ),
			_cellSpace.z * ( sz - 1 )
		);

		const x0 = Math.floor( _cellSpace.x );
		const y0 = Math.floor( _cellSpace.y );
		const z0 = Math.floor( _cellSpace.z );
		const x1 = Math.min( x0 + 1, sx - 1 );
		const y1 = Math.min( y0 + 1, sy - 1 );
		const z1 = Math.min( z0 + 1, sz - 1 );

		const tx = _cellSpace.x - x0;
		const ty = _cellSpace.y - y0;
		const tz = _cellSpace.z - z0;

		for ( let i = 0; i < 9; i ++ ) {

			target.sh.coefficients[ i ].set( 0, 0, 0 );

		}

		let totalWeight = 0;

		const accumulate = ( ix, iy, iz, weight ) => {

			if ( weight <= 0 ) return;

			if ( geometricWeighting === true && normal !== null ) {

				this.getProbePositionAt( ix, iy, iz, _probePosition );
				_sampleToProbe.subVectors( _probePosition, _samplePosition );

				if ( _sampleToProbe.lengthSq() > 0 ) {

					_sampleToProbe.normalize();

					let geometric = Math.max( normal.dot( _sampleToProbe ), 0 );
					geometric = Math.pow( geometric, geometricPower );

					weight *= geometric;

					if ( weight <= 0 ) return;

				}

			}

			const probe = this.getProbeAt( ix, iy, iz );
			const intensityWeight = weight * probe.intensity;
			totalWeight += weight;

			for ( let i = 0; i < 9; i ++ ) {

				target.sh.coefficients[ i ].addScaledVector( probe.sh.coefficients[ i ], intensityWeight );

			}

		};

		accumulate( x0, y0, z0, ( 1 - tx ) * ( 1 - ty ) * ( 1 - tz ) );
		accumulate( x1, y0, z0, tx * ( 1 - ty ) * ( 1 - tz ) );
		accumulate( x0, y1, z0, ( 1 - tx ) * ty * ( 1 - tz ) );
		accumulate( x1, y1, z0, tx * ty * ( 1 - tz ) );
		accumulate( x0, y0, z1, ( 1 - tx ) * ( 1 - ty ) * tz );
		accumulate( x1, y0, z1, tx * ( 1 - ty ) * tz );
		accumulate( x0, y1, z1, ( 1 - tx ) * ty * tz );
		accumulate( x1, y1, z1, tx * ty * tz );

		if ( totalWeight > 0 ) {

			const normalizer = 1 / totalWeight;

			for ( let i = 0; i < 9; i ++ ) {

				target.sh.coefficients[ i ].multiplyScalar( normalizer );

			}

		}

		target.intensity = 1;
		target.position.copy( position );

		return target;

	}

}

export { ProbeGrid };
