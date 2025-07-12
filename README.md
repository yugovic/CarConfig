# Ferrari Car Configurator

Three.jsを使用した3Dフェラーリカーコンフィギュレーターのデモアプリケーション。

## 機能

- 3Dフェラーリモデルの表示
- ボディカラーのカスタマイズ（6色）
- ホイールタイプの選択
- インテリアカラーの選択
- カメラビューの切り替え（フロント、サイド、リア、インテリア）
- マウスによる3Dモデルの回転・ズーム

## セットアップ

1. 依存関係のインストール：
```bash
npm install
```

2. 開発サーバーの起動：
```bash
npm run dev
```

3. ブラウザで http://localhost:3000 にアクセス

## ビルド

本番環境用のビルド：
```bash
npm run build
```

## 技術スタック

- Three.js - 3Dグラフィックス
- Vite - ビルドツール
- GLTFLoader - 3Dモデルの読み込み
- OrbitControls - カメラコントロール