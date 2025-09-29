import { TempNode, MeshBasicNodeMaterial, RenderTarget, RGBAFormat, NearestFilter, QuadMesh, Vector2 } from 'three/webgpu';
import { nodeObject, vec4, vec3, float, modelPosition, modelWorldMatrix, passTexture, hash, Fn, wgslFn, NodeUpdateType, texture, screenUV } from 'three/tsl';

const _size = /*@__PURE__*/ new Vector2();

class MeshBlendNode extends TempNode {
    constructor(sceneOutputNode, sceneDepthNode, camera, scene) {
        super('vec4');
        this.sceneOutputNode = sceneOutputNode;
        this.sceneDepthNode = sceneDepthNode;
        this.updateBeforeType = NodeUpdateType.FRAME;
        this.renderTarget = new RenderTarget(
            window.innerWidth * window.devicePixelRatio,
            window.innerHeight * window.devicePixelRatio,
            { format: RGBAFormat, count: 1, minFilter: NearestFilter, magFilter: NearestFilter }
        );
        this.mainCamera = camera;
        this.mainScene = scene;
        this.factor = float(.1);
        this.kernelSize = float(5);
        this.kernelRadius = float(0.3);   
        this.depthFalloff = float(0.00001);
        this.depthThreshold = float(0.5);
        this.debugMaterial = new MeshBasicNodeMaterial();
        this._quadMesh = new QuadMesh(this.debugMaterial);
    }

    setup(){
        console.log("setup mesh blend")
         const CustomHash = wgslFn(`
            fn Hash(p: vec3f) -> f32 {

                var lp = (fract(p * 0.3183099 + 0.1));
                lp *= 17.0;
                return fract(lp.x * lp.y * lp.z * (lp.x + lp.y + lp.z));
            }
        `)
        this.hashShader = Fn( ( { material, geometry, object } ) => {
            // const objectPosition = new THREE.Vector3();
            // object.getWorldPosition(objectPosition);
            // const pos = vec3().mul(modelPosition);
            let p = vec3(modelWorldMatrix.mul(vec3(modelPosition))).toVar();

            return vec4(CustomHash(p), 0., 0., 1.);
        });
        this.hashMaterial = new MeshBasicNodeMaterial();
        this.hashMaterial.colorNode = this.hashShader();

        const uv = screenUV;
        const FinalOutputNode = Fn(()=>{
            const outputPassFunc1 = wgslFn(`
                fn OutputPassFunc1(sceneColor: vec4<f32>, sceneDepth: vec4<f32>, tex: texture_2d<f32>, sampler: sampler, uv: vec2f, kernelSize: f32, kernelRadius: f32, depthFalloff: f32, depthThreshold: f32) -> vec4<f32> {
                    var result = sceneColor;
                    var seamLocation = vec2<f32>(0., 0.);
                    var minDist = f32(9999999.);

                    let objectIDColor = textureSample(tex, sampler, uv);

                    for(var x: f32 = -kernelSize; x <= kernelSize; x += 1.) {
                        for(var y: f32 = -kernelSize; y <= kernelSize; y += 1.) {
                            let offset = vec2<f32>(x, y) * kernelRadius * sceneDepth.r / kernelSize;
                            let SampleUV = uv + offset;
                            let sampledObjectIDColor = textureSample(tex, sampler, SampleUV);
                            if(sampledObjectIDColor.x != objectIDColor.x) {
                                let dist = dot(offset, offset);
                                if(dist < minDist) {
                                    minDist = dist;
                                    seamLocation = offset;
                                }
                            }
                        }
                    }
                    
                    return vec4<f32>(seamLocation.x, seamLocation.y, minDist, 1.);
                }
            `)

            const finalPass = wgslFn(`
                fn FinalPass(sceneColor: vec3f, mirroredColor: vec3f, seamLocation: vec2f, kernelRadius: f32, sceneDepth: vec4f, otherDepth: vec4f, depthFalloff: f32, minDist: f32, depthThreshold: f32) -> vec3f {
                    
                    let depthDiff = abs(otherDepth.r - sceneDepth.r);
    
                    let maxSearchDistance = kernelRadius / sceneDepth.r;
                    let weight = saturate(0.5 - sqrt(minDist) / maxSearchDistance);
                    let depthWeight = saturate(1. -depthDiff / depthFalloff * kernelRadius);
                    var finalWeight = weight * depthWeight;
    
                    if(sceneDepth.r > sceneDepth.r + depthThreshold){
                        finalWeight = 0.;
                    }
                    return mix(sceneColor, mirroredColor, finalWeight);
                }
            `);

            const pass1 = outputPassFunc1(
                texture(this.sceneOutputNode, uv),
                texture(this.sceneDepthNode, uv),
                texture(this.renderTarget.textures[0], uv), 
                texture(this.sceneOutputNode, uv), 
                uv, this.kernelSize, this.kernelRadius, this.depthFalloff, this.depthThreshold);

            const mirroredColor = texture(this.sceneOutputNode, uv.add(pass1.xy.mul(2.)));
            const otherDepth = texture(this.sceneDepthNode, uv.add(pass1.xy.mul(2.)));

            const sceneColor = texture(this.sceneOutputNode, uv);
            const sceneDepth = texture(this.sceneDepthNode, uv);
            return finalPass(sceneColor, mirroredColor, pass1.xy, this.kernelRadius, sceneDepth, otherDepth, this.depthFalloff, pass1.z, this.depthThreshold);
        })();
        return FinalOutputNode;
    }

    setSize(width, height){
        this.renderTarget.setSize(width, height);
    }

    updateBefore(frame){
        const { renderer } = frame;
        const size = renderer.getSize( _size );
		this.setSize( size.width, size.height );

        this.mainScene.overrideMaterial = this.hashMaterial;
        renderer.setRenderTarget(this.renderTarget);
        renderer.render(this.mainScene, this.mainCamera);

        this.mainScene.overrideMaterial = null;
        renderer.setRenderTarget(null);
        this._quadMesh.render(renderer);
    }

    dispose(){
        this.renderTarget.dispose();
        this.hashMaterial.dispose();
        this.debugMaterial.dispose();
    }
}

export const meshblend = ( sceneOutputNode, sceneDepthNode, camera, scene ) => nodeObject( new MeshBlendNode( sceneOutputNode, sceneDepthNode, camera, scene ) );
