// ポストプロセス（高画質モード）。GTAO による接地感、控えめなブルーム、SMAA。
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export function createComposer(renderer, scene, camera) {
    const size = renderer.getSize(new THREE.Vector2());
    const pr = renderer.getPixelRatio();
    const target = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, {
        type: THREE.HalfFloatType,
        samples: 4
    });
    const composer = new EffectComposer(renderer, target);

    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    const gtao = new GTAOPass(scene, camera, size.x, size.y);
    gtao.output = GTAOPass.OUTPUT.Default;
    gtao.blendIntensity = 0.85;
    gtao.updateGtaoMaterial({
        radius: 0.35,
        distanceExponent: 1,
        thickness: 1,
        scale: 1,
        samples: 16,
        distanceFallOff: 1,
        screenSpaceRadius: false
    });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, radiusExponent: 1, rings: 2, samples: 16 });
    composer.addPass(gtao);

    const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.18, 0.5, 0.92);
    composer.addPass(bloom);

    composer.addPass(new OutputPass());

    const smaa = new SMAAPass(size.x * pr, size.y * pr);
    composer.addPass(smaa);

    return {
        composer,
        gtao,
        bloom,
        setCamera(cam) {
            renderPass.camera = cam;
            gtao.camera = cam;
        },
        setSize(w, h) {
            composer.setSize(w, h);
            const p = renderer.getPixelRatio();
            smaa.setSize(w * p, h * p);
        },
        render() {
            composer.render();
        },
        dispose() {
            composer.dispose();
            gtao.dispose();
            bloom.dispose();
            smaa.dispose();
        }
    };
}
