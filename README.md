# Jaguar Car Configurator

Three.js を使用した 3D ジャガー（X308 世代 XJ）カーコンフィギュレーターです。

## 機能

- 6 車種の 3D モデル（Daimler V8 / XJ8 / XJR / Super V8 / XJ Sovereign / XJ Sport）とスペック表示
- ボディカラー 10 色 + カスタムカラー
- 塗装仕上げ（ソリッド / メタリック / パール / マット）
  - クリアコート、メタリックフレーク、パールの干渉色を物理ベースマテリアルで表現
- ホイール仕上げ（シルバー / ポリッシュ / ガンメタル / グロスブラック / ゴールド）
- ガラスのスモーク（クリア / ライト / ダーク）
- 背景環境の切り替え（スタジオ / SF ガレージ / パーキング）
- 高画質モード（GTAO アンビエントオクルージョン・ブルーム・SMAA）
- 構成を URL で共有（`?car=...&color=...&finish=...`）とスクリーンショット保存
- カメラビュー切り替え、操作がないときの自動回転
- プレゼンテーション用ムービー再生、カメラエディター（プリセットはブラウザに保存）
- タッチ端末対応（パネルはタップで開閉）

## セットアップ

```bash
npm install
npm run dev
```

ブラウザで http://localhost:3000 を開きます。

## ビルド

```bash
npm run build
```

`dist/` に出力されます。`Assets/` の 3D モデルは自動で `dist/Assets/` にコピーされます。

## URL パラメータ

| パラメータ | 値 | 説明 |
|---|---|---|
| `car` | `DaimlerV8` など | 車種 |
| `color` | `0b3a2a` など | ボディカラー（16進、`#` なし） |
| `finish` | `solid` `metallic` `pearl` `matte` | 塗装仕上げ |
| `wheels` | `silver` `polished` `gunmetal` `black` `gold` | ホイール仕上げ |
| `glass` | `clear` `light` `dark` | ガラスのスモーク |
| `env` | `studio` `scifi` `parking` | 背景環境 |
| `quality` | `high` `low` | 画質モードの強制 |
| `debug` | – | コンソールにデバッグログを出力 |

## キーボードショートカット

| キー | 動作 |
|---|---|
| `1` / `2` / `3` | フロント / サイド / リアビュー |
| `Shift + E` | カメラエディターを開く |
| `Shift + G` | ガレージ設定を開く |
| `Esc` | モーダルを閉じる |

## 構成

```
index.html        画面構成
main.js           アプリ本体（シーン、UI、ムービー、カメラエディター）
src/config.js     車種・カラー・仕上げ・環境などの設定データ
src/materials.js  マテリアル分類と PBR 設定（塗装、ホイール、ガラスなど）
src/postprocessing.js  高画質モードのポストプロセス
src/share.js      URL 共有・スクリーンショット
Assets/           3D モデル（GLB）
```

## 技術スタック

- Three.js（GLTFLoader / OrbitControls / RoomEnvironment / RectAreaLight / GTAOPass）
- Vite
