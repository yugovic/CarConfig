// アプリ全体の設定データ。車種・カラー・仕上げ・環境などをここに集約する。

const params = new URLSearchParams(window.location.search);

export const DEBUG = params.has('debug');

/** デバッグ時のみ出力するログ */
export function log(...args) {
    if (DEBUG) console.log(...args);
}

export const CARS = {
    DaimlerV8: {
        name: 'Daimler V8',
        file: './Assets/DaimlerV8.glb',
        years: '1997–2002',
        engine: '4.0L V8',
        power: '約290PS',
        note: 'ロングホイールベース'
    },
    JaguarXJ8: {
        name: 'Jaguar XJ8',
        file: './Assets/JaguarXJ8.glb',
        years: '1997–2003',
        engine: '3.2L / 4.0L V8',
        power: '約240–290PS',
        note: 'X308 スタンダード'
    },
    JaguarXJR: {
        name: 'Jaguar XJR',
        file: './Assets/JaguarXJR.glb',
        years: '1997–2003',
        engine: '4.0L V8 スーパーチャージド',
        power: '約375PS',
        note: 'ハイパフォーマンス'
    },
    JaguarSuperV8: {
        name: 'Jaguar Super V8',
        file: './Assets/JaguarSuperV8.glb',
        years: '1998–2003',
        engine: '4.0L V8 スーパーチャージド',
        power: '約375PS',
        note: 'ロングホイールベース'
    },
    JaguarXJSovereign: {
        name: 'XJ Sovereign',
        file: './Assets/JaguarXJSovereign.glb',
        years: '1997–2003',
        engine: '4.0L V8',
        power: '約290PS',
        note: 'ラグジュアリー'
    },
    JaguarXJSports: {
        name: 'XJ Sport',
        file: './Assets/JaguarXJSports.glb',
        years: '1997–2003',
        engine: '3.2L V8',
        power: '約240PS',
        note: 'スポーツサスペンション'
    }
};

export const COLORS = [
    { id: 'brg', name: 'ブリティッシュレーシンググリーン', hex: '#0b3a2a', finish: 'metallic' },
    { id: 'santorini', name: 'サントリーニブラック', hex: '#0a0a0c', finish: 'metallic' },
    { id: 'midnight', name: 'ミッドナイトブルー', hex: '#14284a', finish: 'metallic' },
    { id: 'polaris', name: 'ポラリスホワイト', hex: '#f1f1ec', finish: 'solid' },
    { id: 'indus', name: 'インダスシルバー', hex: '#b9bdc1', finish: 'metallic' },
    { id: 'seafrost', name: 'シーフロスト', hex: '#8ea8a3', finish: 'metallic' },
    { id: 'carnelian', name: 'カーネリアンレッド', hex: '#7e0f21', finish: 'pearl' },
    { id: 'topaz', name: 'トパーズ', hex: '#9a7b45', finish: 'metallic' },
    { id: 'amethyst', name: 'アメジストパープル', hex: '#3b1856', finish: 'pearl' },
    { id: 'anthracite', name: 'アンスラサイト', hex: '#2b2d31', finish: 'matte' }
];

/**
 * 塗装仕上げ。MeshPhysicalMaterial のパラメータで表現する。
 * flakes: メタリックフレーク用ノーマルマップの強さ
 * iridescence: パール塗装の干渉色
 */
export const FINISHES = {
    solid: {
        name: 'ソリッド', metalness: 0.0, roughness: 0.32,
        clearcoat: 1.0, clearcoatRoughness: 0.06, flakes: 0, iridescence: 0
    },
    metallic: {
        name: 'メタリック', metalness: 0.6, roughness: 0.42,
        clearcoat: 1.0, clearcoatRoughness: 0.04, flakes: 0.32, iridescence: 0
    },
    pearl: {
        name: 'パール', metalness: 0.35, roughness: 0.38,
        clearcoat: 1.0, clearcoatRoughness: 0.03, flakes: 0.18, iridescence: 0.75, iridescenceIOR: 1.35
    },
    matte: {
        name: 'マット', metalness: 0.15, roughness: 0.78,
        clearcoat: 0.0, clearcoatRoughness: 0.6, flakes: 0, iridescence: 0
    }
};

export const WHEEL_FINISHES = {
    silver: { name: 'シルバー', color: '#c9cbcd', metalness: 0.92, roughness: 0.26 },
    polished: { name: 'ポリッシュ', color: '#e8eaec', metalness: 1.0, roughness: 0.08 },
    gunmetal: { name: 'ガンメタル', color: '#474a4f', metalness: 0.9, roughness: 0.3 },
    black: { name: 'グロスブラック', color: '#101012', metalness: 0.6, roughness: 0.18 },
    gold: { name: 'ゴールド', color: '#c9a24a', metalness: 1.0, roughness: 0.2 }
};

export const GLASS_TINTS = {
    // 実車のガラスはわずかに緑がかった暗色。opacity は「奥の暗さ」の量
    // ガラスの拡散色はほぼ黒にし、明るさは反射だけで出す（色を上げると白く濁る）
    clear: { name: 'クリア', color: '#1a2426', opacity: 0.5 },
    light: { name: 'ライトスモーク', color: '#0e1315', opacity: 0.68 },
    dark: { name: 'ダークスモーク', color: '#060809', opacity: 0.88 }
};

/**
 * 背景環境。model が null の場合はスタジオ（床のみ）。
 * transform はガレージ設定モーダルの初期値。
 */
export const ENVIRONMENTS = {
    studio: {
        name: 'スタジオ',
        model: null,
        background: '#070708',
        exposure: 1.15,
        fog: [7, 26],
        shadowScale: 1,
        transform: { scale: 1, height: 0, x: 0, z: 0, rotation: 0, shadowFloorY: 0.01 }
    },
    scifi: {
        name: 'SFガレージ',
        model: './Assets/ScifiGarage.glb',
        background: '#000000',
        exposure: 1.2,
        fog: [12, 45],
        shadowScale: 0.6,
        envMapIntensity: 0.5,
        transform: { scale: 0.5, height: 0.6, x: 1.3, z: 1.0, rotation: 0, shadowFloorY: 0.03 }
    },
    parking: {
        name: 'パーキング',
        model: './Assets/Parking Garage.glb',
        background: '#050505',
        exposure: 0.85,
        fog: [10, 40],
        shadowScale: 1.5,
        envMapIntensity: 0.25,
        transform: { scale: 0.1, height: -0.03, x: 0, z: 0, rotation: 0, shadowFloorY: 0.01 }
    }
};

export const CAMERA_VIEWS = {
    front: { x: -3, y: 1.2, z: -3 },
    side: { x: 3.5, y: 1.2, z: 0 },
    rear: { x: 3, y: 1.2, z: 3 },
    top: { x: 0.5, y: 5.5, z: 0.5 }
};

export const DEFAULT_CONFIG = {
    carModel: 'DaimlerV8',
    bodyColor: COLORS[0].hex,
    finish: COLORS[0].finish,
    wheels: 'silver',
    glass: 'clear',
    environment: 'scifi'
};

export const STORAGE_KEYS = {
    presets: 'jaguar-configurator.camera-presets',
    quality: 'jaguar-configurator.quality'
};

/** 端末性能から初期画質を決める */
export function detectDefaultQuality() {
    const forced = params.get('quality');
    if (forced === 'high' || forced === 'low') return forced;
    try {
        const saved = localStorage.getItem(STORAGE_KEYS.quality);
        if (saved === 'high' || saved === 'low') return saved;
    } catch (e) { /* localStorage 不可 */ }
    const isMobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
    const lowCores = (navigator.hardwareConcurrency || 4) <= 4;
    return (isMobile || lowCores) ? 'low' : 'high';
}
