// マテリアル関連。GLB のマテリアル名をもとにパーツを分類し、写実的なPBR設定に置き換える。
import * as THREE from 'three';
import { FINISHES, WHEEL_FINISHES, GLASS_TINTS, log } from './config.js';

/**
 * マテリアル名の接頭辞でパーツ種別を判定する。
 * 例: "PaintSeafrost.001" -> paint, "PaintedBlack.003" -> trim, "Window.002" -> glass
 */
const PART_RULES = [
    ['trim', n => n.startsWith('painted')],
    ['paint', n => n.startsWith('paint')],
    ['chrome', n => n.startsWith('chrome')],
    ['glass', n => n.startsWith('window') || n.startsWith('glass')],
    ['lens', n => n.startsWith('lens')],
    ['lights', n => n.startsWith('light')],
    ['rim', n => n.startsWith('rim')],
    ['tire', n => n.startsWith('tire') || n.startsWith('tyre')],
    ['brakes', n => n.startsWith('brake')],
    ['leather', n => n.startsWith('leather')],
    ['plastic', n => n.startsWith('plastic')],
    ['rubber', n => n.startsWith('rubber')],
    ['underside', n => n.startsWith('underside')],
    ['badge', n => n.includes('badg')],
    ['gold', n => n === 'gold' || n.startsWith('gold.')],
    ['pinstripe', n => n.startsWith('pinstripe')],
    ['details', n => n.includes('details')]
];

export function emptyParts() {
    const parts = { other: [] };
    for (const [key] of PART_RULES) parts[key] = [];
    return parts;
}

function partTypeFor(materialName) {
    const n = (materialName || '').toLowerCase();
    for (const [key, test] of PART_RULES) {
        if (test(n)) return key;
    }
    return 'other';
}

/**
 * メタリックフレーク用の微細ノーマルマップを生成する。
 * ランダムな法線を高頻度でリピートし、クリアコートの下で細かい粒状の反射を作る。
 */
export function createFlakeNormalMap(size = 256) {
    const data = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i++) {
        let x = Math.random() * 2 - 1;
        let y = Math.random() * 2 - 1;
        let z = 1.0 + Math.random() * 1.5;
        const len = Math.hypot(x, y, z);
        x /= len; y /= len; z /= len;
        data[i * 4] = Math.round((x * 0.5 + 0.5) * 255);
        data[i * 4 + 1] = Math.round((y * 0.5 + 0.5) * 255);
        data[i * 4 + 2] = Math.round((z * 0.5 + 0.5) * 255);
        data[i * 4 + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, size, size);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(70, 70);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
}

/** 塗装の仕上げをマテリアルに適用する */
export function applyFinish(material, finishId, flakeMap) {
    const f = FINISHES[finishId] || FINISHES.solid;
    material.metalness = f.metalness;
    material.roughness = f.roughness;
    material.clearcoat = f.clearcoat;
    material.clearcoatRoughness = f.clearcoatRoughness;
    material.iridescence = f.iridescence || 0;
    if (f.iridescence) {
        material.iridescenceIOR = f.iridescenceIOR || 1.3;
        material.iridescenceThicknessRange = [100, 400];
    }
    if (f.flakes > 0 && flakeMap) {
        material.normalMap = flakeMap;
        material.normalScale.set(f.flakes, f.flakes);
    } else {
        material.normalMap = null;
        material.normalScale.set(1, 1);
    }
    material.envMapIntensity = finishId === 'matte' ? 0.6 : 1.0;
    material.needsUpdate = true;
}

/** ボディ塗装用の MeshPhysicalMaterial を生成する */
export function createPaintMaterial(colorHex, finishId, flakeMap) {
    const mat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(colorHex),
        side: THREE.FrontSide
    });
    mat.name = 'CarPaint';
    applyFinish(mat, finishId, flakeMap);
    return mat;
}

export function applyWheelFinish(materials, finishId) {
    const f = WHEEL_FINISHES[finishId] || WHEEL_FINISHES.silver;
    for (const mat of materials) {
        mat.color.set(f.color);
        mat.metalness = f.metalness;
        mat.roughness = f.roughness;
        mat.envMapIntensity = 1.4;
        mat.needsUpdate = true;
    }
}

export function applyGlassTint(materials, tintId) {
    const t = GLASS_TINTS[tintId] || GLASS_TINTS.clear;
    for (const mat of materials) {
        mat.color.set(t.color);
        mat.opacity = t.opacity;
        mat.needsUpdate = true;
    }
}

function toPhysical(mat, overrides = {}) {
    const p = new THREE.MeshPhysicalMaterial();
    if (mat.color) p.color.copy(mat.color);
    p.map = mat.map || null;
    p.normalMap = mat.normalMap || null;
    p.emissive = mat.emissive ? mat.emissive.clone() : new THREE.Color(0);
    p.emissiveMap = mat.emissiveMap || null;
    p.emissiveIntensity = mat.emissiveIntensity ?? 1;
    p.alphaMap = mat.alphaMap || null;
    p.transparent = mat.transparent;
    p.opacity = mat.opacity;
    p.side = mat.side;
    p.metalness = mat.metalness ?? 0;
    p.roughness = mat.roughness ?? 0.5;
    p.name = mat.name;
    Object.assign(p, overrides);
    return p;
}

/**
 * 車両モデルを写実的なマテリアルに整える。
 * 元のマテリアルはキャッシュ元と共有されているため、必ず複製してから調整する。
 * @returns {{parts: object, materials: THREE.Material[]}} 分類済みパーツと生成したマテリアル
 */
export function prepareCarModel(root, options) {
    const { bodyColor, finish, wheels, glass, flakeMap } = options;
    const parts = emptyParts();
    const created = [];
    const paintMaterial = createPaintMaterial(bodyColor, finish, flakeMap);
    created.push(paintMaterial);

    root.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = true;
        child.receiveShadow = true;

        const sourceMats = Array.isArray(child.material) ? child.material : [child.material];
        const newMats = sourceMats.map((mat) => {
            const type = partTypeFor(mat.name);
            let out;
            switch (type) {
                case 'paint':
                    out = paintMaterial;
                    break;
                case 'trim':
                    out = toPhysical(mat, { metalness: 0.1, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.15 });
                    break;
                case 'chrome':
                    out = toPhysical(mat, { metalness: 1.0, roughness: 0.07, envMapIntensity: 1.6 });
                    out.color.set('#e9ebee');
                    break;
                case 'gold':
                    out = toPhysical(mat, { metalness: 1.0, roughness: 0.18, envMapIntensity: 1.5 });
                    break;
                case 'glass':
                    out = toPhysical(mat, {
                        metalness: 0.0, roughness: 0.04, transparent: true, depthWrite: false,
                        envMapIntensity: 1.6, ior: 1.5, side: THREE.DoubleSide
                    });
                    break;
                case 'lens':
                    out = toPhysical(mat, { metalness: 0.0, roughness: 0.05, transparent: true, envMapIntensity: 1.5, clearcoat: 1.0 });
                    out.opacity = Math.min(mat.opacity ?? 1, 0.85);
                    break;
                case 'lights':
                    out = toPhysical(mat, { metalness: 0.9, roughness: 0.2, envMapIntensity: 1.4 });
                    break;
                case 'rim':
                    out = toPhysical(mat, { clearcoat: 0.8, clearcoatRoughness: 0.1 });
                    break;
                case 'tire':
                    out = toPhysical(mat, { metalness: 0.0, roughness: 0.88, envMapIntensity: 0.4 });
                    out.color.set('#161616');
                    break;
                case 'brakes':
                    out = toPhysical(mat, { metalness: 0.85, roughness: 0.45 });
                    break;
                case 'leather':
                    out = toPhysical(mat, { metalness: 0.0, roughness: 0.62, sheen: 0.3, sheenRoughness: 0.8, envMapIntensity: 0.6 });
                    break;
                case 'plastic':
                    out = toPhysical(mat, { metalness: 0.0, roughness: 0.55, envMapIntensity: 0.5 });
                    break;
                case 'rubber':
                    out = toPhysical(mat, { metalness: 0.0, roughness: 0.9, envMapIntensity: 0.3 });
                    break;
                case 'underside':
                    out = toPhysical(mat, { metalness: 0.2, roughness: 0.9, envMapIntensity: 0.2 });
                    break;
                default:
                    out = toPhysical(mat);
            }
            if (out !== paintMaterial) created.push(out);
            parts[type].push({ mesh: child, material: out });
            return out;
        });

        child.material = Array.isArray(child.material) ? newMats : newMats[0];
    });

    applyWheelFinish(parts.rim.map(p => p.material), wheels);
    applyGlassTint(parts.glass.map(p => p.material), glass);

    log('Car parts classified:', Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v.length])));
    return { parts, materials: created, paintMaterial };
}

/** 生成したマテリアルを解放する */
export function disposeMaterials(materials) {
    for (const m of materials) {
        // flakeMap など共有テクスチャは解放しない
        m.dispose();
    }
}
