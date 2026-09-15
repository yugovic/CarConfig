// 共有機能。URL への状態の保存／復元、リンクコピー、スクリーンショット保存。
import { CARS, FINISHES, WHEEL_FINISHES, GLASS_TINTS, ENVIRONMENTS } from './config.js';

const KEYS = ['car', 'color', 'finish', 'wheels', 'glass', 'env'];

/** URL クエリから設定を読み取る。不正な値は無視する。 */
export function readStateFromURL() {
    const p = new URLSearchParams(window.location.search);
    const state = {};
    const car = p.get('car');
    if (car && CARS[car]) state.carModel = car;
    const color = p.get('color');
    if (color && /^[0-9a-fA-F]{6}$/.test(color)) state.bodyColor = '#' + color.toLowerCase();
    const finish = p.get('finish');
    if (finish && FINISHES[finish]) state.finish = finish;
    const wheels = p.get('wheels');
    if (wheels && WHEEL_FINISHES[wheels]) state.wheels = wheels;
    const glass = p.get('glass');
    if (glass && GLASS_TINTS[glass]) state.glass = glass;
    const env = p.get('env');
    if (env && ENVIRONMENTS[env]) state.environment = env;
    return state;
}

export function buildShareURL(config) {
    const url = new URL(window.location.href);
    for (const k of KEYS) url.searchParams.delete(k);
    url.searchParams.set('car', config.carModel);
    url.searchParams.set('color', config.bodyColor.replace('#', ''));
    url.searchParams.set('finish', config.finish);
    url.searchParams.set('wheels', config.wheels);
    url.searchParams.set('glass', config.glass);
    url.searchParams.set('env', config.environment);
    return url.toString();
}

/** 現在の設定を URL に反映する（履歴は増やさない） */
export function writeStateToURL(config) {
    try {
        window.history.replaceState(null, '', buildShareURL(config));
    } catch (e) { /* file:// などでは失敗する */ }
}

export async function copyShareLink(config) {
    const url = buildShareURL(config);
    try {
        await navigator.clipboard.writeText(url);
        return true;
    } catch (e) {
        window.prompt('このリンクをコピーしてください', url);
        return false;
    }
}

/** レンダリング直後のキャンバスを PNG として保存する */
export function downloadScreenshot(canvas, renderFn, filename) {
    renderFn();
    canvas.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, 'image/png');
}
