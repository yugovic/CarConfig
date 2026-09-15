import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import {
    CARS, COLORS, FINISHES, WHEEL_FINISHES, GLASS_TINTS, ENVIRONMENTS, CAMERA_VIEWS,
    DEFAULT_CONFIG, STORAGE_KEYS, log, detectDefaultQuality
} from './src/config.js';
import {
    prepareCarModel, disposeMaterials, applyFinish, applyWheelFinish, applyGlassTint, createFlakeNormalMap
} from './src/materials.js';
import { createComposer } from './src/postprocessing.js';
import { readStateFromURL, writeStateToURL, copyShareLink, downloadScreenshot } from './src/share.js';

class CarConfigurator {
    constructor() {
        this.container = document.getElementById('canvas-container');
        this.loadingScreen = document.getElementById('loading');

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.post = null;               // ポストプロセス（高画質時のみ）
        this.flakeMap = null;           // メタリックフレーク用ノーマルマップ

        // 車両
        this.carModel = null;
        this.carParts = null;           // 分類済みパーツ
        this.carMaterials = [];         // 表示中の車で生成したマテリアル（解放用）
        this.paintMaterial = null;
        this.loadedModels = {};         // 読み込み済み GLTF シーン
        this.loadingModels = {};        // 読み込み中の Promise
        this.availableCars = Object.fromEntries(Object.entries(CARS).map(([k, v]) => [k, v.file]));

        // 設定（URL パラメータで上書き可能）
        this.currentConfig = { ...DEFAULT_CONFIG, ...readStateFromURL() };
        this.quality = detectDefaultQuality();

        // 環境
        this.environmentModels = {};    // 読み込み済みガレージモデル
        this.garageModel = null;
        this.garageSettings = { ...ENVIRONMENTS[this.currentConfig.environment].transform };
        this.shadowFloor = null;
        this.studioFloor = null;

        // カメラ
        this.cameraSettings = { fov: 30 };
        this.cameraPositions = CAMERA_VIEWS;
        this.autoRotateEnabled = true;
        this.idleDelay = 6000;
        this.lastInteraction = performance.now();
        this.firstDisplay = true;

        // ムービー
        this.moviePlaying = false;
        this.animationProgress = 0;
        this.animationDuration = 30000;
        this.animationStartTime = 0;
        this.animationId = null;

        // カメラエディター
        this.cameraEditor = null;
        this.cameraPreviewActive = false;

        this.init();
    }

    init() {
        this.setupScene();
        this.setupCamera();
        this.setupRenderer();
        this.setupLighting();
        this.setupControls();
        this.setupEnvironmentMap();
        this.setupFloor();
        this.flakeMap = createFlakeNormalMap();
        this.setQuality(this.quality, false);

        this.buildUI();
        this.setupEventListeners();
        this.setupCameraEditor();
        this.initializeUI();

        this.setEnvironment(this.currentConfig.environment);
        this.loadCars();
        this.animate();
    }

    // ------------------------------------------------------------------
    // シーン構築
    // ------------------------------------------------------------------

    setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000);
        this.scene.fog = new THREE.Fog(0x000000, 12, 45);
    }

    setupCamera() {
        const aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(this.cameraSettings.fov, aspect, 0.1, 100);
        this.camera.position.set(-3, 1.2, -3);
        this.camera.lookAt(0, 0.5, 0);
    }

    setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        // 高DPI端末での負荷を抑える
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.container.appendChild(this.renderer.domElement);
    }

    setupLighting() {
        RectAreaLightUniformsLib.init();

        // 全体の環境光（上下で色味を変える）
        const hemi = new THREE.HemisphereLight(0xffffff, 0x1a1a1a, 0.35);
        this.scene.add(hemi);

        // 主光源。影はこのライトのみが落とす（影付きライトを減らして負荷を抑える）
        const key = new THREE.DirectionalLight(0xffffff, 1.6);
        key.position.set(3, 8, 2);
        key.castShadow = true;
        key.shadow.camera.near = 0.5;
        key.shadow.camera.far = 30;
        key.shadow.camera.left = -6;
        key.shadow.camera.right = 6;
        key.shadow.camera.top = 6;
        key.shadow.camera.bottom = -6;
        key.shadow.mapSize.set(2048, 2048);
        key.shadow.bias = -0.0004;
        key.shadow.normalBias = 0.02;
        this.scene.add(key);
        this.keyLight = key;

        // スタジオのソフトボックスを模した面光源。ボディに長いハイライトを作る
        const overhead = new THREE.RectAreaLight(0xffffff, 5, 5, 1.4);
        overhead.position.set(0, 3.2, 0);
        overhead.lookAt(0, 0, 0);
        this.scene.add(overhead);

        // 側面の面光源。下端が床より上に来る高さに置く（床と交差すると硬い境界が出る）
        const sideL = new THREE.RectAreaLight(0xffffff, 2.5, 1.4, 2.4);
        sideL.position.set(-3.8, 1.8, 0);
        sideL.lookAt(0, 0.6, 0);
        this.scene.add(sideL);

        const sideR = new THREE.RectAreaLight(0xfff4e6, 2.0, 1.4, 2.4);
        sideR.position.set(3.8, 1.8, 0);
        sideR.lookAt(0, 0.6, 0);
        this.scene.add(sideR);

        // リムライト（車の輪郭を背景から分離する）
        const rim = new THREE.SpotLight(0xffffff, 6, 15, Math.PI / 5, 0.6, 1);
        rim.position.set(-2, 4, 5);
        rim.target.position.set(0, 0.5, 0);
        this.scene.add(rim);
        this.scene.add(rim.target);

        log('Lighting setup complete');
    }

    setupControls() {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 1.5;
        this.controls.maxDistance = 8;
        this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
        this.controls.autoRotateSpeed = 0.6;
        this.controls.target.set(0, 0.5, 0);
        this.controls.update();

        // 操作があったら自動回転を止める
        this.controls.addEventListener('start', () => this.noteInteraction());
    }

    /** RoomEnvironment を PMREM 化してスタジオ風の反射環境を作る（外部 HDR 不要） */
    setupEnvironmentMap() {
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        const envScene = new RoomEnvironment();
        this.scene.environment = pmrem.fromScene(envScene, 0.04).texture;
        pmrem.dispose();
    }

    setupFloor() {
        // スタジオ用の光沢床（ガレージ非表示時のみ表示）
        const floorGeo = new THREE.CircleGeometry(40, 96);
        const floorMat = new THREE.MeshPhysicalMaterial({
            color: 0x0a0a0c,
            roughness: 0.65,
            metalness: 0.0,
            clearcoat: 0.3,
            clearcoatRoughness: 0.6,
            // 環境マップの反射を切り、面光源のやわらかい映り込みと車の影だけを見せる
            envMapIntensity: 0.04
        });
        this.studioFloor = new THREE.Mesh(floorGeo, floorMat);
        this.studioFloor.rotation.x = -Math.PI / 2;
        this.studioFloor.receiveShadow = true;
        this.studioFloor.visible = false;
        this.scene.add(this.studioFloor);

        // 影受け専用の透明な床
        const shadowGeo = new THREE.PlaneGeometry(20, 20);
        const shadowMat = new THREE.ShadowMaterial({ opacity: 0.45, color: 0x000000, transparent: true });
        this.shadowFloor = new THREE.Mesh(shadowGeo, shadowMat);
        this.shadowFloor.rotation.x = -Math.PI / 2;
        this.shadowFloor.position.y = this.garageSettings.shadowFloorY;
        this.shadowFloor.receiveShadow = true;
        this.scene.add(this.shadowFloor);
    }

    /** 画質モードを切り替える。high はポストプロセス（GTAO・ブルーム・SMAA）を有効化する */
    setQuality(quality, persist = true) {
        this.quality = quality;
        if (quality === 'high') {
            if (!this.post) {
                try {
                    this.post = createComposer(this.renderer, this.scene, this.camera);
                } catch (e) {
                    console.error('Post-processing unavailable, falling back to standard quality', e);
                    this.quality = 'low';
                }
            }
        } else if (this.post) {
            this.post.dispose();
            this.post = null;
        }
        if (this.keyLight) {
            const size = this.quality === 'high' ? 2048 : 1024;
            if (this.keyLight.shadow.mapSize.x !== size) {
                this.keyLight.shadow.mapSize.set(size, size);
                if (this.keyLight.shadow.map) {
                    this.keyLight.shadow.map.dispose();
                    this.keyLight.shadow.map = null;
                }
            }
        }
        const toggle = document.getElementById('qualityToggle');
        if (toggle) toggle.checked = this.quality === 'high';
        if (persist) {
            try { localStorage.setItem(STORAGE_KEYS.quality, this.quality); } catch (e) { /* ignore */ }
        }
    }

    // ------------------------------------------------------------------
    // 環境（スタジオ／ガレージ）
    // ------------------------------------------------------------------

    loadEnvironmentModel(envId) {
        const env = ENVIRONMENTS[envId];
        if (this.environmentModels[envId]) return this.environmentModels[envId];
        this.environmentModels[envId] = new Promise((resolve, reject) => {
            new GLTFLoader().load(env.model, (gltf) => {
                const model = gltf.scene;
                model.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = false; // 影受けは専用床に任せる
                        if (child.material) {
                            child.material.envMapIntensity = env.envMapIntensity ?? 0.5;
                        }
                    }
                });
                model.visible = false;
                this.scene.add(model);
                log('Environment loaded:', envId);
                resolve(model);
            }, undefined, (error) => {
                console.error('Error loading environment:', envId, error);
                delete this.environmentModels[envId];
                reject(error);
            });
        });
        return this.environmentModels[envId];
    }

    async setEnvironment(envId) {
        const env = ENVIRONMENTS[envId];
        if (!env) return;
        this.currentConfig.environment = envId;
        this.garageSettings = { ...env.transform };
        this.syncGarageSliders();
        this.scene.background.set(env.background);
        this.scene.fog.color.set(env.background);
        if (env.fog) {
            this.scene.fog.near = env.fog[0];
            this.scene.fog.far = env.fog[1];
        }
        this.renderer.toneMappingExposure = env.exposure;

        if (this.garageModel) this.garageModel.visible = false;
        this.garageModel = null;
        this.studioFloor.visible = !env.model;
        this.updateGarageTransform();
        this.updateActiveOption('.env-option', envId, 'env');
        writeStateToURL(this.currentConfig);

        if (!env.model) return;
        try {
            const model = await this.loadEnvironmentModel(envId);
            if (this.currentConfig.environment !== envId) return; // 読み込み中に切り替わった
            this.garageModel = model;
            model.visible = true;
            this.updateGarageTransform();
        } catch (e) {
            // 読み込みに失敗した場合はスタジオにフォールバック
            this.studioFloor.visible = true;
        }
    }

    updateGarageTransform() {
        const s = this.garageSettings;
        if (this.garageModel) {
            this.garageModel.scale.setScalar(s.scale);
            this.garageModel.position.set(s.x, s.height, s.z);
            this.garageModel.rotation.y = s.rotation * Math.PI / 180;
        }
        if (this.shadowFloor) {
            const hasGarage = !!this.garageModel;
            this.shadowFloor.position.set(hasGarage ? s.x : 0, s.shadowFloorY, hasGarage ? s.z : 0);
            this.shadowFloor.rotation.y = hasGarage ? s.rotation * Math.PI / 180 : 0;
            const env = ENVIRONMENTS[this.currentConfig.environment];
            this.shadowFloor.scale.setScalar(env?.shadowScale ?? 1);
        }
    }

    /** ガレージ設定モーダルのスライダーを現在値に合わせる */
    syncGarageSliders() {
        const s = this.garageSettings;
        const fields = [
            ['garageScale', 'garageScaleValue', s.scale, v => v.toFixed(2) + 'x'],
            ['garageHeight', 'garageHeightValue', s.height, v => v.toFixed(1) + 'm'],
            ['garageX', 'garageXValue', s.x, v => v.toFixed(1) + 'm'],
            ['garageZ', 'garageZValue', s.z, v => v.toFixed(1) + 'm'],
            ['garageRotation', 'garageRotationValue', s.rotation, v => v.toFixed(0) + '°'],
            ['shadowFloorY', 'shadowFloorYValue', s.shadowFloorY, v => v.toFixed(2) + 'm']
        ];
        for (const [sliderId, valueId, value, fmt] of fields) {
            const slider = document.getElementById(sliderId);
            const label = document.getElementById(valueId);
            if (slider) slider.value = value;
            if (label) label.textContent = fmt(value);
        }
    }

    // ------------------------------------------------------------------
    // 車両の読み込みと表示
    // ------------------------------------------------------------------

    loadCarAsset(carName) {
        if (this.loadedModels[carName]) return Promise.resolve(this.loadedModels[carName]);
        if (!this.loadingModels[carName]) {
            const path = this.availableCars[carName];
            this.loadingModels[carName] = new Promise((resolve, reject) => {
                new GLTFLoader().load(path, (gltf) => {
                    this.loadedModels[carName] = gltf.scene;
                    this.setCardState(carName, 'loaded');
                    log('Loaded:', carName);
                    resolve(gltf.scene);
                }, undefined, (error) => {
                    console.error(`Error loading ${carName}:`, error);
                    delete this.loadingModels[carName];
                    this.setCardState(carName, 'error');
                    reject(error);
                });
            });
        }
        return this.loadingModels[carName];
    }

    /** 選択中の車を最優先で読み込んで表示し、残りは裏で順次読み込む */
    async loadCars() {
        const first = this.currentConfig.carModel;
        this.updateLoadingText(`${CARS[first].name} を読み込み中...`);
        try {
            await this.displayCar(first);
        } catch (e) {
            this.updateLoadingText('モデルの読み込みに失敗しました');
            return;
        }
        this.hideLoading();

        for (const name of Object.keys(CARS)) {
            if (name === first) continue;
            try { await this.loadCarAsset(name); } catch (e) { /* 個別に失敗しても継続 */ }
        }
    }

    updateLoadingText(text) {
        const loadingText = this.loadingScreen.querySelector('p');
        if (loadingText) loadingText.textContent = text;
    }

    hideLoading() {
        this.loadingScreen.classList.add('hidden');
        setTimeout(() => { this.loadingScreen.style.display = 'none'; }, 500);
    }

    setCardState(carName, state) {
        const card = document.querySelector(`.model-card[data-car="${carName}"]`);
        if (!card) return;
        card.classList.remove('loading', 'loaded', 'error');
        card.classList.add(state);
    }

    changeCar(carName) {
        if (!this.availableCars[carName]) return;
        this.displayCar(carName);
    }

    removeCurrentCar() {
        if (!this.carModel) return;
        this.scene.remove(this.carModel);
        disposeMaterials(this.carMaterials);
        this.carModel = null;
        this.carParts = null;
        this.carMaterials = [];
        this.paintMaterial = null;
    }

    async displayCar(carName) {
        this.currentConfig.carModel = carName;
        this.updateActiveOption('.model-card', carName, 'car');
        if (!this.loadedModels[carName]) this.setCardState(carName, 'loading');

        const source = await this.loadCarAsset(carName);
        if (this.currentConfig.carModel !== carName) return; // 読み込み中に別の車が選ばれた

        this.removeCurrentCar();

        // clone() はジオメトリとマテリアルを共有するため、マテリアルは prepareCarModel 内で複製する
        this.carModel = source.clone();
        this.carModel.scale.set(0.5, 0.5, 0.5);
        this.carModel.position.set(0, 0, 0.5);

        const { parts, materials, paintMaterial } = prepareCarModel(this.carModel, {
            bodyColor: this.currentConfig.bodyColor,
            finish: this.currentConfig.finish,
            wheels: this.currentConfig.wheels,
            glass: this.currentConfig.glass,
            flakeMap: this.flakeMap
        });
        this.carParts = parts;
        this.carMaterials = materials;
        this.paintMaterial = paintMaterial;
        this.scene.add(this.carModel);

        if (this.firstDisplay) {
            this.firstDisplay = false;
            this.camera.position.set(-3, 1.2, -3);
            this.controls.target.set(0, 0.5, 0);
            this.controls.update();
        }
        this.updateSpecPanel(carName);
        writeStateToURL(this.currentConfig);
    }

    // ------------------------------------------------------------------
    // カスタマイズ
    // ------------------------------------------------------------------

    changePaintColor(color) {
        this.currentConfig.bodyColor = color;
        if (this.paintMaterial) this.paintMaterial.color.set(color);
        writeStateToURL(this.currentConfig);
    }

    changeFinish(finishId) {
        if (!FINISHES[finishId]) return;
        this.currentConfig.finish = finishId;
        if (this.paintMaterial) applyFinish(this.paintMaterial, finishId, this.flakeMap);
        this.updateActiveOption('.finish-option', finishId, 'finish');
        writeStateToURL(this.currentConfig);
    }

    changeWheelFinish(id) {
        if (!WHEEL_FINISHES[id]) return;
        this.currentConfig.wheels = id;
        if (this.carParts) applyWheelFinish(this.carParts.rim.map(p => p.material), id);
        this.updateActiveOption('.wheel-option', id, 'wheels');
        writeStateToURL(this.currentConfig);
    }

    changeGlassTint(id) {
        if (!GLASS_TINTS[id]) return;
        this.currentConfig.glass = id;
        if (this.carParts) applyGlassTint(this.carParts.glass.map(p => p.material), id);
        this.updateActiveOption('.glass-option', id, 'glass');
        writeStateToURL(this.currentConfig);
    }

    setCameraView(view) {
        const position = this.cameraPositions[view];
        if (!position) return;
        this.noteInteraction();
        this.camera.position.set(position.x, position.y, position.z);
        this.controls.target.set(0, 0.5, 0);
        this.controls.update();
    }

    noteInteraction() {
        this.lastInteraction = performance.now();
        this.controls.autoRotate = false;
    }

    takeScreenshot() {
        const color = this.currentConfig.bodyColor.replace('#', '');
        const name = `jaguar-${this.currentConfig.carModel}-${color}.png`;
        downloadScreenshot(this.renderer.domElement, () => this.renderFrame(), name);
    }

    async shareLink() {
        const ok = await copyShareLink(this.currentConfig);
        this.showToast(ok ? 'リンクをコピーしました' : 'リンクを表示しました');
    }

    showToast(message) {
        const toast = document.getElementById('toast');
        if (!toast) return;
        toast.textContent = message;
        toast.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
    }

    // ------------------------------------------------------------------
    // UI
    // ------------------------------------------------------------------

    /** 設定データから選択 UI を生成する */
    buildUI() {
        const modelGrid = document.querySelector('.model-grid');
        if (modelGrid) {
            modelGrid.innerHTML = Object.entries(CARS).map(([id, car]) => `
                <div class="model-card" data-car="${id}" role="button" tabindex="0">
                    <h3>${car.name}</h3>
                    <p class="model-spec">${car.engine} · ${car.power}</p>
                </div>`).join('');
        }

        const colorGrid = document.querySelector('.color-grid');
        if (colorGrid) {
            colorGrid.innerHTML = COLORS.map(c => `
                <div class="color-option" data-color="${c.hex}" data-finish="${c.finish}" title="${c.name}" role="button" tabindex="0">
                    <div class="color-circle" style="background-color: ${c.hex};"></div>
                    <span>${c.name}</span>
                </div>`).join('');
        }

        const pill = (cls, id, label, extraStyle = '') =>
            `<button class="pill ${cls}" data-id="${id}" ${extraStyle}>${label}</button>`;

        const finishRow = document.querySelector('.finish-options');
        if (finishRow) {
            finishRow.innerHTML = Object.entries(FINISHES).map(([id, f]) => pill('finish-option', id, f.name)).join('');
        }
        const wheelRow = document.querySelector('.wheel-options');
        if (wheelRow) {
            wheelRow.innerHTML = Object.entries(WHEEL_FINISHES).map(([id, w]) =>
                `<button class="pill wheel-option" data-id="${id}"><span class="swatch" style="background:${w.color}"></span>${w.name}</button>`).join('');
        }
        const glassRow = document.querySelector('.glass-options');
        if (glassRow) {
            glassRow.innerHTML = Object.entries(GLASS_TINTS).map(([id, g]) =>
                `<button class="pill glass-option" data-id="${id}"><span class="swatch" style="background:${g.color}"></span>${g.name}</button>`).join('');
        }
        const envRow = document.querySelector('.env-options');
        if (envRow) {
            envRow.innerHTML = Object.entries(ENVIRONMENTS).map(([id, e]) => pill('env-option', id, e.name)).join('');
        }
    }

    updateActiveOption(selector, id, attr) {
        document.querySelectorAll(selector).forEach(el => {
            el.classList.toggle('active', el.dataset[attr === 'car' ? 'car' : (attr === 'color' ? 'color' : 'id')] === id);
        });
    }

    updateSpecPanel(carName) {
        const car = CARS[carName];
        const panel = document.getElementById('specPanel');
        if (!car || !panel) return;
        panel.innerHTML = `
            <h3>${car.name}</h3>
            <dl>
                <dt>年式</dt><dd>${car.years}</dd>
                <dt>エンジン</dt><dd>${car.engine}</dd>
                <dt>最高出力</dt><dd>${car.power}</dd>
                <dt>特徴</dt><dd>${car.note}</dd>
            </dl>
            <p class="spec-note">※ 参考値</p>`;
    }

    initializeUI() {
        const modelTab = document.querySelector('.tab-btn[data-tab="models"]');
        const modelPanel = document.getElementById('models-panel');
        if (modelTab && modelPanel) {
            modelTab.classList.add('active');
            modelPanel.classList.add('active');
        }

        const c = this.currentConfig;
        this.updateActiveOption('.model-card', c.carModel, 'car');
        this.updateActiveOption('.color-option', c.bodyColor, 'color');
        this.updateActiveOption('.finish-option', c.finish, 'finish');
        this.updateActiveOption('.wheel-option', c.wheels, 'wheels');
        this.updateActiveOption('.glass-option', c.glass, 'glass');
        this.updateActiveOption('.env-option', c.environment, 'env');

        const colorPicker = document.getElementById('bodyColorPicker');
        if (colorPicker) colorPicker.value = c.bodyColor;

        const rotateToggle = document.getElementById('autoRotateToggle');
        if (rotateToggle) rotateToggle.checked = this.autoRotateEnabled;

        this.updateSpecPanel(c.carModel);
        this.syncGarageSliders();
    }

    setupEventListeners() {
        const container = document.querySelector('.configurator-container');

        // タブ切り替え。タッチ端末では hover が効かないため、クリックで開閉もする
        const tabNavigation = document.querySelector('.tab-navigation');
        if (tabNavigation) {
            tabNavigation.addEventListener('click', (e) => {
                const btn = e.target.closest('.tab-btn');
                if (!btn) return;
                const tabName = btn.dataset.tab;
                const wasActive = btn.classList.contains('active');
                if (wasActive && container.classList.contains('open')) {
                    container.classList.remove('open');
                    return;
                }
                container.classList.add('open');
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
                const targetPanel = document.getElementById(`${tabName}-panel`);
                if (targetPanel) targetPanel.classList.add('active');
            });
        }
        // キャンバス操作でパネルを閉じる
        this.renderer.domElement.addEventListener('pointerdown', () => {
            container?.classList.remove('open');
            this.closeDevMenu();
        });

        // ムービー
        for (const id of ['playMovie', 'playMovieTop']) {
            const btn = document.getElementById(id);
            if (btn) {
                btn.addEventListener('click', () => {
                    if (this.moviePlaying) this.stopMovie(); else this.playMovie();
                });
            }
        }

        // モデル選択
        const modelGrid = document.querySelector('.model-grid');
        if (modelGrid) {
            const select = (e) => {
                const card = e.target.closest('.model-card');
                if (!card) return;
                this.changeCar(card.dataset.car);
            };
            modelGrid.addEventListener('click', select);
            modelGrid.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(e); } });
        }

        // カラー
        const colorGrid = document.querySelector('.color-grid');
        if (colorGrid) {
            const select = (e) => {
                const option = e.target.closest('.color-option');
                if (!option) return;
                const color = option.dataset.color;
                this.updateActiveOption('.color-option', color, 'color');
                this.changePaintColor(color);
                // プリセットカラーには推奨の仕上げを合わせる
                if (option.dataset.finish) this.changeFinish(option.dataset.finish);
                const colorPicker = document.getElementById('bodyColorPicker');
                if (colorPicker) colorPicker.value = color;
            };
            colorGrid.addEventListener('click', select);
            colorGrid.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(e); } });
        }

        const colorPicker = document.getElementById('bodyColorPicker');
        if (colorPicker) {
            colorPicker.addEventListener('input', (e) => {
                this.changePaintColor(e.target.value);
                document.querySelectorAll('.color-option').forEach(o => o.classList.remove('active'));
            });
        }

        // 仕上げ・ホイール・ガラス・環境
        const bindPills = (selector, handler) => {
            const row = document.querySelector(selector);
            if (!row) return;
            row.addEventListener('click', (e) => {
                const btn = e.target.closest('.pill');
                if (btn) handler(btn.dataset.id);
            });
        };
        bindPills('.finish-options', id => this.changeFinish(id));
        bindPills('.wheel-options', id => this.changeWheelFinish(id));
        bindPills('.glass-options', id => this.changeGlassTint(id));
        bindPills('.env-options', id => this.setEnvironment(id));

        // ビュー
        const viewPresets = document.querySelector('.view-presets');
        if (viewPresets) {
            viewPresets.addEventListener('click', (e) => {
                const btn = e.target.closest('.view-btn');
                if (btn) this.setCameraView(btn.dataset.view);
            });
        }

        const rotateToggle = document.getElementById('autoRotateToggle');
        if (rotateToggle) {
            rotateToggle.addEventListener('change', (e) => {
                this.autoRotateEnabled = e.target.checked;
                this.noteInteraction();
            });
        }

        const qualityToggle = document.getElementById('qualityToggle');
        if (qualityToggle) {
            qualityToggle.checked = this.quality === 'high';
            qualityToggle.addEventListener('change', (e) => this.setQuality(e.target.checked ? 'high' : 'low'));
        }

        // 共有・スクリーンショット
        document.getElementById('shareLink')?.addEventListener('click', () => this.shareLink());
        document.getElementById('screenshotBtn')?.addEventListener('click', () => this.takeScreenshot());

        // 開発者メニュー
        const devMenuBtn = document.getElementById('devMenuBtn');
        const devMenu = document.getElementById('devMenu');
        if (devMenuBtn && devMenu) {
            devMenuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                devMenu.classList.toggle('open');
            });
            devMenu.addEventListener('click', (e) => {
                const item = e.target.closest('[data-action]');
                if (!item) return;
                this.closeDevMenu();
                if (item.dataset.action === 'camera-editor') this.openModal('editorModal');
                if (item.dataset.action === 'garage') this.openModal('garageModal');
            });
            document.addEventListener('click', (e) => {
                if (!devMenu.contains(e.target) && e.target !== devMenuBtn) this.closeDevMenu();
            });
        }

        window.addEventListener('resize', () => {
            const width = this.container.clientWidth;
            const height = this.container.clientHeight;
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(width, height);
            if (this.post) this.post.setSize(width, height);
        });

        // キーボードショートカット（入力中は無視）
        window.addEventListener('keydown', (e) => {
            const tag = (e.target.tagName || '').toLowerCase();
            if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
            if (e.shiftKey && e.key.toLowerCase() === 'e') { e.preventDefault(); this.openModal('editorModal'); }
            else if (e.shiftKey && e.key.toLowerCase() === 'g') { e.preventDefault(); this.openModal('garageModal'); }
            else if (e.key === 'Escape') { this.closeModal('editorModal'); this.closeModal('garageModal'); }
            else if (e.key === '1') this.setCameraView('front');
            else if (e.key === '2') this.setCameraView('side');
            else if (e.key === '3') this.setCameraView('rear');
        });

        // モーダル
        document.getElementById('closeModal')?.addEventListener('click', () => this.closeModal('editorModal'));
        document.getElementById('closeGarageModal')?.addEventListener('click', () => this.closeModal('garageModal'));
        for (const id of ['editorModal', 'garageModal']) {
            const modal = document.getElementById(id);
            modal?.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });
        }
        this.setupModalDragging();
        this.setupGarageControls();

        // カメラFOV
        const cameraFOVSlider = document.getElementById('cameraFOV');
        const cameraFOVValue = document.getElementById('cameraFOVValue');
        if (cameraFOVSlider && cameraFOVValue) {
            cameraFOVSlider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                cameraFOVValue.textContent = value.toFixed(0) + '°';
                this.cameraSettings.fov = value;
                this.camera.fov = value;
                this.camera.updateProjectionMatrix();
            });
        }
    }

    openModal(id) {
        const modal = document.getElementById(id);
        if (!modal) return;
        modal.classList.add('active');
        if (id === 'editorModal' && !this.cameraEditor) this.setupCameraEditor();
    }

    closeModal(id) {
        document.getElementById(id)?.classList.remove('active');
    }

    closeDevMenu() {
        document.getElementById('devMenu')?.classList.remove('open');
    }

    // ------------------------------------------------------------------
    // 描画ループ
    // ------------------------------------------------------------------

    renderFrame() {
        if (this.post) this.post.render();
        else this.renderer.render(this.scene, this.camera);
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        const interactive = !this.cameraPreviewActive && !this.moviePlaying;
        if (interactive) {
            if (this.autoRotateEnabled && !this.controls.autoRotate &&
                performance.now() - this.lastInteraction > this.idleDelay) {
                this.controls.autoRotate = true;
            }
            this.controls.update();
        }
        this.renderFrame();
    }

    setupGarageControls() {
        const garageScaleSlider = document.getElementById('garageScale');
        const garageScaleValue = document.getElementById('garageScaleValue');
        const garageHeightSlider = document.getElementById('garageHeight');
        const garageHeightValue = document.getElementById('garageHeightValue');
        const garageXSlider = document.getElementById('garageX');
        const garageXValue = document.getElementById('garageXValue');
        const garageZSlider = document.getElementById('garageZ');
        const garageZValue = document.getElementById('garageZValue');
        const garageRotationSlider = document.getElementById('garageRotation');
        const garageRotationValue = document.getElementById('garageRotationValue');
        const shadowFloorYSlider = document.getElementById('shadowFloorY');
        const shadowFloorYValue = document.getElementById('shadowFloorYValue');
        
        if (garageScaleSlider && garageScaleValue) {
            garageScaleSlider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                garageScaleValue.textContent = value.toFixed(2) + 'x';
                this.garageSettings.scale = value;
                this.updateGarageTransform();
            });
        }
        
        if (garageHeightSlider && garageHeightValue) {
            garageHeightSlider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                garageHeightValue.textContent = value.toFixed(1) + 'm';
                this.garageSettings.height = value;
                this.updateGarageTransform();
            });
        }
        
        if (garageXSlider && garageXValue) {
            garageXSlider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                garageXValue.textContent = value.toFixed(1) + 'm';
                this.garageSettings.x = value;
                this.updateGarageTransform();
            });
        }
        
        if (garageZSlider && garageZValue) {
            garageZSlider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                garageZValue.textContent = value.toFixed(1) + 'm';
                this.garageSettings.z = value;
                this.updateGarageTransform();
            });
        }
        
        if (garageRotationSlider && garageRotationValue) {
            garageRotationSlider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                garageRotationValue.textContent = value.toFixed(0) + '°';
                this.garageSettings.rotation = value;
                this.updateGarageTransform();
            });
        }
        
        if (shadowFloorYSlider && shadowFloorYValue) {
            shadowFloorYSlider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                shadowFloorYValue.textContent = value.toFixed(2) + 'm';
                this.garageSettings.shadowFloorY = value;
                this.updateGarageTransform();
            });
        }
        
        // リセットボタン
        const resetButton = document.getElementById('resetGarage');
        if (resetButton) {
            resetButton.addEventListener('click', () => {
                this.garageSettings = { ...ENVIRONMENTS[this.currentConfig.environment].transform };
                
                // スライダーの値を更新
                if (garageScaleSlider) garageScaleSlider.value = this.garageSettings.scale;
                if (garageScaleValue) garageScaleValue.textContent = this.garageSettings.scale.toFixed(2) + 'x';
                if (garageHeightSlider) garageHeightSlider.value = this.garageSettings.height;
                if (garageHeightValue) garageHeightValue.textContent = this.garageSettings.height.toFixed(1) + 'm';
                if (garageXSlider) garageXSlider.value = this.garageSettings.x;
                if (garageXValue) garageXValue.textContent = this.garageSettings.x.toFixed(1) + 'm';
                if (garageZSlider) garageZSlider.value = this.garageSettings.z;
                if (garageZValue) garageZValue.textContent = this.garageSettings.z.toFixed(1) + 'm';
                if (garageRotationSlider) garageRotationSlider.value = this.garageSettings.rotation;
                if (garageRotationValue) garageRotationValue.textContent = this.garageSettings.rotation.toFixed(0) + '°';
                if (shadowFloorYSlider) shadowFloorYSlider.value = this.garageSettings.shadowFloorY;
                if (shadowFloorYValue) shadowFloorYValue.textContent = this.garageSettings.shadowFloorY.toFixed(2) + 'm';
                
                // カメラFOVもリセット
                this.cameraSettings.fov = 30;
                this.camera.fov = 30;
                this.camera.updateProjectionMatrix();
                const cameraFOVSlider = document.getElementById('cameraFOV');
                const cameraFOVValue = document.getElementById('cameraFOVValue');
                if (cameraFOVSlider) cameraFOVSlider.value = 30;
                if (cameraFOVValue) cameraFOVValue.textContent = '30°';
                
                // カメラエディターのFOVもリセット
                const cameraFOVEditorSlider = document.getElementById('cameraFOVEditor');
                const cameraFOVEditorValue = document.getElementById('cameraFOVEditorValue');
                if (cameraFOVEditorSlider) cameraFOVEditorSlider.value = 30;
                if (cameraFOVEditorValue) cameraFOVEditorValue.textContent = '30°';
                
                this.updateGarageTransform();
            });
        }
        
        // 適用ボタン（モーダルを閉じる）
        const applyButton = document.getElementById('applyGarage');
        if (applyButton) {
            applyButton.addEventListener('click', () => {
                const modal = document.getElementById('garageModal');
                if (modal) {
                    modal.classList.remove('active');
                }
            });
        }
    }
    
    setupModalDragging() {
        const modal = document.getElementById('editorModal');
        const modalContent = modal?.querySelector('.modal-content');
        const modalHeader = modal?.querySelector('.modal-header');
        
        if (!modal || !modalContent || !modalHeader) return;
        
        let isDragging = false;
        let currentX;
        let currentY;
        let initialX;
        let initialY;
        let xOffset = 0;
        let yOffset = 0;
        
        function dragStart(e) {
            if (e.target.closest('.modal-close')) return;
            
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
            
            if (e.target === modalHeader || modalHeader.contains(e.target)) {
                isDragging = true;
            }
        }
        
        function dragEnd(e) {
            initialX = currentX;
            initialY = currentY;
            isDragging = false;
        }
        
        function drag(e) {
            if (e.preventDefault) {
                e.preventDefault();
            }
            
            if (!isDragging) return;
            
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
            
            xOffset = currentX;
            yOffset = currentY;
            
            modalContent.style.transform = `translate(${currentX}px, ${currentY}px)`;
        }
        
        modalHeader.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);
        
        // モーダルが閉じられたときにリセット
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    if (!modal.classList.contains('active')) {
                        xOffset = 0;
                        yOffset = 0;
                        modalContent.style.transform = '';
                    }
                }
            });
        });
        
        observer.observe(modal, { attributes: true });
    }
    
    setupCameraEditor() {
        const canvas = document.getElementById('cameraEditor2D');
        if (!canvas) return;
        
        this.cameraEditor = new CameraEditor2D(canvas, this);
        
        // スライダーのイベントリスナー
        const startHeightSlider = document.getElementById('cameraStartHeight');
        const startHeightValue = document.getElementById('startHeightValue');
        const endHeightSlider = document.getElementById('cameraEndHeight');
        const endHeightValue = document.getElementById('endHeightValue');
        const speedSlider = document.getElementById('cameraSpeed');
        const speedValue = document.getElementById('speedValue');
        
        if (startHeightSlider && startHeightValue) {
            startHeightSlider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                startHeightValue.textContent = value.toFixed(1) + 'm';
                if (this.cameraEditor) {
                    this.cameraEditor.cameraStartHeight = value;
                }
            });
        }
        
        if (endHeightSlider && endHeightValue) {
            endHeightSlider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                endHeightValue.textContent = value.toFixed(1) + 'm';
                if (this.cameraEditor) {
                    this.cameraEditor.cameraEndHeight = value;
                }
            });
        }
        
        if (speedSlider && speedValue) {
            speedSlider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                speedValue.textContent = value.toFixed(1) + 'x';
                if (this.cameraEditor) {
                    this.cameraEditor.animationSpeed = value;
                }
            });
        }
        
        // カメラエディターのFOVスライダー
        const cameraFOVEditorSlider = document.getElementById('cameraFOVEditor');
        const cameraFOVEditorValue = document.getElementById('cameraFOVEditorValue');
        
        if (cameraFOVEditorSlider && cameraFOVEditorValue) {
            // 現在のFOV値をセット
            cameraFOVEditorSlider.value = this.cameraSettings.fov;
            cameraFOVEditorValue.textContent = this.cameraSettings.fov + '°';
            
            cameraFOVEditorSlider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                cameraFOVEditorValue.textContent = value.toFixed(0) + '°';
                this.cameraSettings.fov = value;
                this.camera.fov = value;
                this.camera.updateProjectionMatrix();
                
                // ガレージ設定モーダルのFOVスライダーも更新
                const cameraFOVSlider = document.getElementById('cameraFOV');
                const cameraFOVValue = document.getElementById('cameraFOVValue');
                if (cameraFOVSlider) cameraFOVSlider.value = value;
                if (cameraFOVValue) cameraFOVValue.textContent = value.toFixed(0) + '°';
            });
        }
        
        // ボタンのイベントリスナー
        const clearPathBtn = document.getElementById('clearPath');
        if (clearPathBtn) {
            clearPathBtn.addEventListener('click', () => {
                if (this.cameraEditor) {
                    this.cameraEditor.clearPath();
                }
            });
        }
        
        const previewPathBtn = document.getElementById('previewPath');
        if (previewPathBtn) {
            previewPathBtn.addEventListener('click', () => {
                if (this.cameraEditor) {
                    this.cameraEditor.previewPath();
                }
            });
        }
        
        const applyPathBtn = document.getElementById('applyPath');
        if (applyPathBtn) {
            applyPathBtn.addEventListener('click', () => {
                if (this.cameraEditor) {
                    this.cameraEditor.applyPath();
                }
            });
        }
        
        // プリセットボタン
        const preset1Btn = document.getElementById('preset1');
        if (preset1Btn) {
            preset1Btn.addEventListener('click', () => {
                if (this.cameraEditor) {
                    this.cameraEditor.loadPreset(1);
                }
            });
        }
        
        const preset2Btn = document.getElementById('preset2');
        if (preset2Btn) {
            preset2Btn.addEventListener('click', () => {
                if (this.cameraEditor) {
                    this.cameraEditor.loadPreset(2);
                }
            });
        }
        
        const preset3Btn = document.getElementById('preset3');
        if (preset3Btn) {
            preset3Btn.addEventListener('click', () => {
                if (this.cameraEditor) {
                    this.cameraEditor.loadPreset(3);
                }
            });
        }
        
        // プリセット保存ボタン
        const savePresetBtn = document.getElementById('savePreset');
        if (savePresetBtn) {
            savePresetBtn.addEventListener('click', () => {
                if (this.cameraEditor) {
                    this.cameraEditor.savePreset();
                }
            });
        }
        
        // 高さテストボタン
        const testLowHeightBtn = document.getElementById('testLowHeight');
        if (testLowHeightBtn) {
            testLowHeightBtn.addEventListener('click', () => {
                if (this.cameraEditor) {
                    this.cameraEditor.testLowHeight();
                }
            });
        }
        
        const testHighHeightBtn = document.getElementById('testHighHeight');
        if (testHighHeightBtn) {
            testHighHeightBtn.addEventListener('click', () => {
                if (this.cameraEditor) {
                    this.cameraEditor.testHighHeight();
                }
            });
        }
    }
    
    playMovie() {
        this.moviePlaying = true;
        this.animationStartTime = Date.now();
        this.animationProgress = 0;
        this.currentPresetIndex = 0; // 現在のプリセットインデックス
        this.presetStartTime = Date.now(); // プリセット開始時間
        
        // UI更新（下部のボタン）
        const movieBtn = document.getElementById('playMovie');
        const movieProgress = document.querySelector('.movie-progress');
        const movieIcon = movieBtn.querySelector('.movie-icon');
        const movieText = movieBtn.querySelector('.movie-text');
        
        if (movieBtn) {
            movieBtn.classList.add('playing');
            if (movieIcon) {
                movieIcon.classList.remove('fa-play');
                movieIcon.classList.add('fa-pause');
            }
            if (movieText) movieText.textContent = 'ムービー停止';
        }
        if (movieProgress) movieProgress.classList.add('active');
        
        // UI更新（右上のボタン）
        const movieBtnTop = document.getElementById('playMovieTop');
        const movieProgressTop = document.getElementById('movieProgressTop');
        
        if (movieBtnTop) {
            movieBtnTop.classList.add('playing');
        }
        if (movieProgressTop) {
            movieProgressTop.classList.add('active');
        }
        
        // OrbitControlsを無効化してカメラの制御を完全に取得
        this.controls.enabled = false;
        // 現在のカメラ位置を保存
        this.savedCameraPosition = this.camera.position.clone();
        this.savedCameraRotation = this.camera.rotation.clone();
        
        // アニメーションループ開始
        this.animateMovieWithPresets();
    }
    
    stopMovie() {
        this.moviePlaying = false;
        
        // UI更新（下部のボタン）
        const movieBtn = document.getElementById('playMovie');
        const movieProgress = document.querySelector('.movie-progress');
        const progressBar = document.getElementById('movieProgress');
        const movieIcon = movieBtn?.querySelector('.movie-icon');
        const movieText = movieBtn?.querySelector('.movie-text');
        
        if (movieBtn) {
            movieBtn.classList.remove('playing');
            if (movieIcon) {
                movieIcon.classList.remove('fa-pause');
                movieIcon.classList.add('fa-play');
            }
            if (movieText) movieText.textContent = 'ムービー再生';
        }
        if (movieProgress) movieProgress.classList.remove('active');
        if (progressBar) progressBar.style.width = '0%';
        
        // UI更新（右上のボタン）
        const movieBtnTop = document.getElementById('playMovieTop');
        const movieProgressTop = document.getElementById('movieProgressTop');
        const progressBarTop = movieProgressTop?.querySelector('.progress-bar');
        
        if (movieBtnTop) {
            movieBtnTop.classList.remove('playing');
        }
        if (movieProgressTop) {
            movieProgressTop.classList.remove('active');
        }
        if (progressBarTop) {
            progressBarTop.style.width = '0%';
        }
        
        // OrbitControlsを有効化
        this.controls.enabled = true;
        
        // アニメーションIDをクリア
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        
        // カメラを初期位置に戻す
        this.camera.position.set(-3, 1.2, -3);
        this.camera.lookAt(0, 0.5, 0);
        
        // FOVも元に戻す
        this.camera.fov = this.cameraSettings.fov;
        this.camera.updateProjectionMatrix();
    }
    
    animateMovieWithPresets() {
        if (!this.moviePlaying) return;
        
        const currentTime = Date.now();
        const totalElapsed = currentTime - this.animationStartTime;
        const presetDuration = 5000; // 各プリセット5秒
        const totalDuration = presetDuration * 3; // 合計15秒
        
        this.animationProgress = Math.min(totalElapsed / totalDuration, 1);
        
        // プログレスバー更新（下部）
        const progressBar = document.getElementById('movieProgress');
        if (progressBar) {
            progressBar.style.width = `${this.animationProgress * 100}%`;
        }
        
        // プログレスバー更新（右上）
        const progressBarTop = document.querySelector('#movieProgressTop .progress-bar');
        if (progressBarTop) {
            progressBarTop.style.width = `${this.animationProgress * 100}%`;
        }
        
        // 現在のプリセットインデックスを計算
        const presetIndex = Math.floor((this.animationProgress * 3));
        
        // プリセットが切り替わったらカメラエディターを更新
        if (presetIndex !== this.currentPresetIndex && presetIndex < 3) {
            this.currentPresetIndex = presetIndex;
            this.presetStartTime = currentTime;
            log(`Switching to preset ${presetIndex + 1}`);
        }
        
        // 現在のプリセット内での進行状況を計算
        const presetElapsed = currentTime - this.presetStartTime;
        const presetProgress = Math.min(presetElapsed / presetDuration, 1);
        
        // 現在のプリセットを適用
        if (this.currentPresetIndex < 3 && this.cameraEditor) {
            const preset = this.cameraEditor.presets[this.currentPresetIndex + 1];
            if (preset) {
                this.applyPresetAnimation(preset, presetProgress);
            }
        }
        
        if (this.animationProgress < 1) {
            this.animationId = requestAnimationFrame(() => this.animateMovieWithPresets());
        } else {
            // アニメーション終了
            this.stopMovie();
        }
    }
    
    applyPresetAnimation(preset, progress) {
        // プリセットのFOVを適用（最初のフレームのみ）
        if (progress === 0 && preset.fov !== undefined) {
            this.camera.fov = preset.fov;
            this.camera.updateProjectionMatrix();
        }
        
        // 補間タイプに応じた進行率を計算
        let interpolatedProgress = progress;
        switch (preset.interpolationType) {
            case 'easeInOut':
                interpolatedProgress = this.easeInOutCubic(progress);
                break;
            case 'easeIn':
                interpolatedProgress = progress * progress;
                break;
            case 'easeOut':
                interpolatedProgress = 1 - (1 - progress) * (1 - progress);
                break;
        }
        
        // カメラ位置を補間
        const x = this.lerp(preset.startPoint.x, preset.endPoint.x, interpolatedProgress);
        const y = this.lerp(preset.cameraStartHeight, preset.cameraEndHeight, interpolatedProgress);
        const z = this.lerp(preset.startPoint.z, preset.endPoint.z, interpolatedProgress);
        
        this.camera.position.set(x, y, z);
        
        // デバッグログ（詳細）
        const debugInterval = 0.25; // 0%, 25%, 50%, 75%, 100%でログ出力
        const shouldLog = progress === 0 || 
                         Math.abs(progress - 0.25) < 0.01 || 
                         Math.abs(progress - 0.5) < 0.01 || 
                         Math.abs(progress - 0.75) < 0.01 || 
                         Math.abs(progress - 1) < 0.01;
        
        if (shouldLog) {
            log(`\n=== ${preset.name} - Progress: ${progress.toFixed(2)} ===`);
            log(`Camera position: x=${x.toFixed(3)}, y=${y.toFixed(3)}, z=${z.toFixed(3)}`);
            log(`Look mode: ${preset.cameraLookMode}, Pan: ${preset.cameraPan}°, Tilt: ${preset.cameraTilt}°`);
        }
        
        // カメラの向きを設定（previewCameraPathと同じロジックを使用）
        switch (preset.cameraLookMode) {
            case 'lookAtCar':
                // 車の中心を見る
                this.camera.lookAt(0, 0.5, 0);
                break;
            case 'lookForward':
                // 進行方向を見る
                const dx = preset.endPoint.x - preset.startPoint.x;
                const dz = preset.endPoint.z - preset.startPoint.z;
                const length = Math.sqrt(dx * dx + dz * dz);
                if (length > 0) {
                    const normalizedDx = dx / length;
                    const normalizedDz = dz / length;
                    const lookDistance = 5;
                    this.camera.lookAt(
                        x + normalizedDx * lookDistance,
                        y,
                        z + normalizedDz * lookDistance
                    );
                }
                break;
            case 'parallel':
                // 平行移動（前方固定）
                this.camera.lookAt(x, y, z - 10);
                break;
            case 'angle':
                // 角度指定
                const panRad = (preset.cameraPan * Math.PI) / 180;
                const tiltRad = (preset.cameraTilt * Math.PI) / 180;
                const distance = 10;
                
                // カメラの向きを計算（previewCameraPathと同じ計算式）
                const lookX = x + distance * Math.sin(panRad) * Math.cos(tiltRad);
                const lookY = y + distance * Math.sin(tiltRad);
                const lookZ = z - distance * Math.cos(panRad) * Math.cos(tiltRad);
                
                // カメラの向きを設定
                this.camera.lookAt(lookX, lookY, lookZ);
                
                // ムービー再生中はOrbitControlsを更新しない
                if (!this.moviePlaying && this.controls) {
                    this.controls.target.set(lookX, lookY, lookZ);
                }
                
                if (shouldLog) {
                    log(`LookAt target: x=${lookX.toFixed(3)}, y=${lookY.toFixed(3)}, z=${lookZ.toFixed(3)}`);
                    log(`Camera forward vector:`, this.camera.getWorldDirection(new THREE.Vector3()).toArray().map(v => v.toFixed(3)));
                }
                break;
            default:
                // デフォルトは車を見る
                this.camera.lookAt(0, 0.5, 0);
                break;
        }
    }
    
    applyCameraAnimation(progress) {
        // カメラシーケンスを定義
        const sequences = [
            // 0-10%: ヒーローショット（遠景から接近）
            {
                start: 0,
                end: 0.1,
                camera: (t) => {
                    const distance = this.lerp(8, 4.5, t);
                    const height = 1.5; // Y座標を固定
                    const angle = Math.PI * 0.2;
                    return {
                        x: Math.sin(angle) * distance,
                        y: height,
                        z: Math.cos(angle) * distance,
                        lookAt: { x: 0, y: 0.5, z: 0 }
                    };
                }
            },
            // 10-25%: フロントフォーカス（左から右へ平行移動）
            {
                start: 0.1,
                end: 0.25,
                camera: (t) => {
                    const distance = 2.5; // 車からの一定距離
                    const height = 0.8;
                    const xOffset = this.lerp(-1.5, 1.5, t); // 左から右へ
                    const zPos = -1.8; // 前方位置で固定
                    return {
                        x: xOffset,
                        y: height,
                        z: zPos,
                        lookAt: { x: xOffset * 0.2, y: 0.6, z: 0 } // 車体の前部中心を追従
                    };
                }
            },
            // 25-40%: サイドプロファイル（横から全体を見せる）
            {
                start: 0.25,
                end: 0.4,
                camera: (t) => {
                    const angle = this.lerp(Math.PI * 0.15, Math.PI * 0.5, t);
                    const distance = this.lerp(2, 5, t);
                    const height = this.lerp(0.8, 1.2, t);
                    return {
                        x: Math.sin(angle) * distance,
                        y: height,
                        z: Math.cos(angle) * distance,
                        lookAt: { x: 0, y: 0.5, z: 0 }
                    };
                }
            },
            // 40-50%: ホイールフォーカス（前輪から後輪へ平行移動）
            {
                start: 0.4,
                end: 0.5,
                camera: (t) => {
                    const distance = 1.8; // ホイールへの距離
                    const height = 0.3; // ホイールの高さ
                    const xPos = 2.0; // 車の横位置で固定
                    const zOffset = this.lerp(-0.8, 0.8, t); // 前輪から後輪へ
                    return {
                        x: xPos,
                        y: height,
                        z: zOffset,
                        lookAt: { x: 0.8, y: 0.2, z: zOffset } // ホイール位置を追従
                    };
                }
            },
            // 50-65%: リアフォーカス（右から左へ平行移動）
            {
                start: 0.5,
                end: 0.65,
                camera: (t) => {
                    const distance = 2.5; // 車からの一定距離
                    const height = 0.8;
                    const xOffset = this.lerp(1.5, -1.5, t); // 右から左へ
                    const zPos = 1.8; // 後方位置で固定
                    return {
                        x: xOffset,
                        y: height,
                        z: zPos,
                        lookAt: { x: xOffset * 0.2, y: 0.6, z: 0 } // 車体の後部中心を追従
                    };
                }
            },
            // 65-80%: 高角度俯瞰ショット
            {
                start: 0.65,
                end: 0.8,
                camera: (t) => {
                    const angle = this.lerp(Math.PI * 0.85, Math.PI * 1.25, t);
                    const distance = this.lerp(4, 5, t);
                    const height = this.lerp(1.5, 4, t);
                    return {
                        x: Math.sin(angle) * distance,
                        y: height,
                        z: Math.cos(angle) * distance,
                        lookAt: { x: 0, y: 0.3, z: 0 }
                    };
                }
            },
            // 80-100%: フィナーレ（カメラが車の周りを回る）
            {
                start: 0.8,
                end: 1,
                camera: (t) => {
                    const angle = this.lerp(Math.PI * 1.25, Math.PI * 2.25, t);
                    const distance = 4.5;
                    const height = 1.8; // Y座標を固定
                    return {
                        x: Math.sin(angle) * distance,
                        y: height,
                        z: Math.cos(angle) * distance,
                        lookAt: { x: 0, y: 0.5, z: 0 }
                    };
                }
            }
        ];
        
        // 現在のシーケンスを見つけて適用
        for (const seq of sequences) {
            if (progress >= seq.start && progress <= seq.end) {
                const localProgress = (progress - seq.start) / (seq.end - seq.start);
                const smoothProgress = this.easeInOutCubic(localProgress);
                const pos = seq.camera(smoothProgress);
                
                // カメラ位置を更新
                this.camera.position.set(pos.x, pos.y, pos.z);
                this.camera.lookAt(pos.lookAt.x, pos.lookAt.y, pos.lookAt.z);
                
                // 車は回転しない（削除）
                
                break;
            }
        }
    }
    
    // 線形補間
    lerp(start, end, t) {
        return start + (end - start) * t;
    }
    
    // イージング関数
    easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }
    
    initializeUI() {
        log('\n=== Initializing UI ===');
        
        // デフォルトでモデルタブをアクティブに
        const modelTab = document.querySelector('.tab-btn[data-tab="models"]');
        const modelPanel = document.getElementById('models-panel');
        log('Model tab found:', modelTab);
        log('Model panel found:', modelPanel);
        
        if (modelTab && modelPanel) {
            modelTab.classList.add('active');
            modelPanel.classList.add('active');
            log('Set model tab and panel as active');
        }
        
        // すべてのタブパネルの状態を確認
        const allPanels = document.querySelectorAll('.tab-panel');
        log('\nAll panels status:');
        allPanels.forEach(panel => {
            log(`Panel ${panel.id}: classes = ${panel.classList.toString()}`);
        });
        
        // 初期カラーオプションをアクティブに
        const firstColorOption = document.querySelector('.color-option');
        if (firstColorOption) {
            firstColorOption.classList.add('active');
            log('Set first color option as active');
        }
        
        log('=== UI Initialization complete ===\n');
    }
    
    
    previewCameraPath(pathConfig) {
        if (this.moviePlaying) {
            this.stopMovie();
        }
        
        // オービットコントロールを無効化
        this.controls.enabled = false;
        
        // プレビュー中フラグを設定
        this.cameraPreviewActive = true;
        
        const startTime = Date.now();
        const duration = pathConfig.duration || 3000;
        
        const animatePreview = () => {
            const elapsed = Date.now() - startTime;
            const t = Math.min(elapsed / duration, 1);
            
            // 補間タイプに応じた進行率を計算
            let progress = t;
            switch (pathConfig.interpolation) {
                case 'easeInOut':
                    progress = this.easeInOutCubic(t);
                    break;
                case 'easeIn':
                    progress = t * t;
                    break;
                case 'easeOut':
                    progress = 1 - (1 - t) * (1 - t);
                    break;
            }
            
            // カメラ位置を補間
            const x = this.lerp(pathConfig.start.x, pathConfig.end.x, progress);
            const y = this.lerp(pathConfig.start.y, pathConfig.end.y, progress); // 高さも補間
            const z = this.lerp(pathConfig.start.z, pathConfig.end.z, progress);
            
            // 詳細なデバッグログ
            if (t === 0 || Math.abs(t - 0.25) < 0.01 || Math.abs(t - 0.5) < 0.01 || Math.abs(t - 0.75) < 0.01 || Math.abs(t - 1) < 0.01) {
                log(`\n=== Camera Animation Debug t=${t.toFixed(2)} ===`);
                log(`Interpolated position: x=${x.toFixed(3)}, y=${y.toFixed(3)}, z=${z.toFixed(3)}`);
                log(`Start height: ${pathConfig.start.y}, End height: ${pathConfig.end.y}`);
                log(`Camera world position:`, this.camera.position.toArray().map(v => v.toFixed(3)));
                log(`Camera FOV: ${this.camera.fov}°`);
                log(`Camera near/far: ${this.camera.near}/${this.camera.far}`);
            }
            
            this.camera.position.set(x, y, z);
            
            
            // カメラの向きを設定
            switch (pathConfig.lookMode || 'lookAtCar') {
                case 'lookAtCar':
                    // 車の中心を見る
                    this.camera.lookAt(0, 0.5, 0);
                    break;
                case 'lookForward':
                    // 進行方向を見る
                    const dx = pathConfig.end.x - pathConfig.start.x;
                    const dz = pathConfig.end.z - pathConfig.start.z;
                    const length = Math.sqrt(dx * dx + dz * dz);
                    if (length > 0) {
                        const normalizedDx = dx / length;
                        const normalizedDz = dz / length;
                        const lookDistance = 5; // 前方を見る距離
                        this.camera.lookAt(
                            x + normalizedDx * lookDistance,
                            y,
                            z + normalizedDz * lookDistance
                        );
                    }
                    break;
                case 'parallel':
                    // 平行移動（前方固定）
                    this.camera.lookAt(x, y, z - 10);
                    break;
                case 'angle':
                    // 角度指定
                    if (pathConfig.angles) {
                        const panRad = (pathConfig.angles.pan * Math.PI) / 180;
                        const tiltRad = (pathConfig.angles.tilt * Math.PI) / 180;
                        const distance = 10;
                        
                        // カメラの向きを計算
                        const lookX = x + distance * Math.sin(panRad) * Math.cos(tiltRad);
                        const lookY = y + distance * Math.sin(tiltRad);
                        const lookZ = z - distance * Math.cos(panRad) * Math.cos(tiltRad);
                        
                        this.camera.lookAt(lookX, lookY, lookZ);
                    }
                    break;
            }
            
            if (t < 1) {
                requestAnimationFrame(animatePreview);
            } else {
                // アニメーション終了
                this.cameraPreviewActive = false;
                this.controls.enabled = true;
                if (this.cameraEditor) {
                    this.cameraEditor.draw(); // エディターを更新
                }
                log('\n=== Camera Animation Complete ===');
                log('Final camera position:', this.camera.position.toArray().map(v => v.toFixed(3)));
            }
        };
        
        animatePreview();
    }
    
}

// CameraEditor2D クラス
class CameraEditor2D {
    constructor(canvas, carConfigurator) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.carConfigurator = carConfigurator;
        
        // エディターの状態
        this.startPoint = null;
        this.endPoint = null;
        this.cameraStartHeight = 1.5;  // 始点高さ
        this.cameraEndHeight = 1.5;    // 終点高さ
        this.animationSpeed = 1.0;
        this.interpolationType = 'linear';
        this.cameraLookMode = 'lookAtCar';
        
        // 角度指定用
        this.cameraPan = 0;  // 水平回転角度
        this.cameraTilt = 0; // 垂直回転角度
        
        // プリセット管理
        this.presets = {
            1: {
                name: 'サイド',
                startPoint: { x: -1.7071651090342679, z: -1.3711805555555556 },
                endPoint: { x: -1.7320872274143302, z: 1.6510416666666667 },
                cameraStartHeight: 0.3,
                cameraEndHeight: 0.3,
                animationSpeed: 0.5,
                interpolationType: 'linear',
                cameraLookMode: 'angle',
                cameraPan: 92,
                cameraTilt: 0,
                fov: 30
            },
            2: {
                name: 'リア',
                startPoint: { x: -0.8348909657320879, z: 2.2954861111111104 },
                endPoint: { x: 0.8598130841121493, z: 2.228819444444444 },
                cameraStartHeight: 0.4,
                cameraEndHeight: 0.4,
                animationSpeed: 0.5,
                interpolationType: 'linear',
                cameraLookMode: 'angle',
                cameraPan: 1,
                cameraTilt: 0,
                fov: 30
            },
            3: {
                name: 'フロント',
                startPoint: { x: 0.9375, z: -2.5 },
                endPoint: { x: -0.6875, z: -2.5 },
                cameraStartHeight: 0.3,
                cameraEndHeight: 0.3,
                animationSpeed: 0.5,
                interpolationType: 'linear',
                cameraLookMode: 'angle',
                cameraPan: 180,
                cameraTilt: 0,
                fov: 30
            }
        };
        
        this.currentPresetSlot = null;
        this.loadStoredPresets();
        
        // キャンバスのスケール設定
        this.scale = 30; // キャンバスサイズに合わせて調整
        this.offsetX = canvas.width / 2;
        this.offsetY = canvas.height / 2;
        
        // イベントリスナー設定
        this.setupEventListeners();
        
        // 初期描画
        this.draw();
    }
    
    setupEventListeners() {
        this.canvas.addEventListener('click', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // キャンバスの表示サイズとレンダリングサイズの比率を計算
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;
            
            // 正しいキャンバス座標を計算
            const canvasX = x * scaleX;
            const canvasY = y * scaleY;
            
            // ピクセル座標を3D空間座標に変換
            const worldX = (canvasX - this.offsetX) / this.scale;
            const worldZ = (canvasY - this.offsetY) / this.scale;
            
            if (!this.startPoint) {
                this.startPoint = { x: worldX, z: worldZ };
                this.updateStatus('終点を選択してください');
            } else if (!this.endPoint) {
                this.endPoint = { x: worldX, z: worldZ };
                this.updateStatus('パスが設定されました');
            } else {
                // 既存のパスがある場合は新しく始める
                this.startPoint = { x: worldX, z: worldZ };
                this.endPoint = null;
                this.updateStatus('終点を選択してください');
            }
            
            this.draw();
        });
        
        // 補間タイプの変更
        const interpolationSelect = document.getElementById('interpolationType');
        if (interpolationSelect) {
            interpolationSelect.addEventListener('change', (e) => {
                this.interpolationType = e.target.value;
            });
        }
        
        // カメラの向きモードの変更
        const lookModeSelect = document.getElementById('cameraLookMode');
        if (lookModeSelect) {
            lookModeSelect.addEventListener('change', (e) => {
                this.cameraLookMode = e.target.value;
                // 角度コントロールの表示切り替え
                const angleControls = document.getElementById('angleControls');
                if (angleControls) {
                    angleControls.style.display = e.target.value === 'angle' ? 'block' : 'none';
                }
                this.draw(); // ビューを更新
            });
        }
        
        // 角度スライダーのイベントリスナー
        const panSlider = document.getElementById('cameraPan');
        const panValue = document.getElementById('panValue');
        const tiltSlider = document.getElementById('cameraTilt');
        const tiltValue = document.getElementById('tiltValue');
        
        if (panSlider && panValue) {
            panSlider.addEventListener('input', (e) => {
                this.cameraPan = parseFloat(e.target.value);
                panValue.textContent = this.cameraPan;
                this.draw(); // ビューを更新
            });
        }
        
        if (tiltSlider && tiltValue) {
            tiltSlider.addEventListener('input', (e) => {
                this.cameraTilt = parseFloat(e.target.value);
                tiltValue.textContent = this.cameraTilt;
                this.draw(); // ビューを更新
            });
        }
    }
    
    draw() {
        // キャンバスをクリア
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // グリッドを描画
        this.drawGrid();
        
        // 車を描画（中心に固定）
        this.drawCar();
        
        // 現在のカメラ位置を描画
        this.drawCurrentCamera();
        
        // パスを描画
        if (this.startPoint) {
            this.drawPoint(this.startPoint, '#00ff00', '始点');
        }
        if (this.endPoint) {
            this.drawPoint(this.endPoint, '#ff0000', '終点');
        }
        if (this.startPoint && this.endPoint) {
            this.drawPath();
        }
    }
    
    drawGrid() {
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        this.ctx.lineWidth = 1;
        
        // 垂直線
        for (let x = 0; x < this.canvas.width; x += this.scale) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }
        
        // 水平線
        for (let y = 0; y < this.canvas.height; y += this.scale) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }
        
        // 中心軸を強調
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        this.ctx.beginPath();
        this.ctx.moveTo(this.offsetX, 0);
        this.ctx.lineTo(this.offsetX, this.canvas.height);
        this.ctx.moveTo(0, this.offsetY);
        this.ctx.lineTo(this.canvas.width, this.offsetY);
        this.ctx.stroke();
    }
    
    drawCar() {
        const carWidth = 1.8 * this.scale;
        const carLength = 4.5 * this.scale;
        
        // 車体
        this.ctx.fillStyle = 'rgba(100, 100, 100, 0.8)';
        this.ctx.fillRect(
            this.offsetX - carWidth / 2,
            this.offsetY - carLength / 2,
            carWidth,
            carLength
        );
        
        // 車の向き（前方）を示す三角形
        this.ctx.fillStyle = 'rgba(255, 40, 0, 0.8)';
        this.ctx.beginPath();
        this.ctx.moveTo(this.offsetX, this.offsetY - carLength / 2 - 10);
        this.ctx.lineTo(this.offsetX - 10, this.offsetY - carLength / 2);
        this.ctx.lineTo(this.offsetX + 10, this.offsetY - carLength / 2);
        this.ctx.closePath();
        this.ctx.fill();
        
        // 車のラベル
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = '12px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('車', this.offsetX, this.offsetY + 4);
    }
    
    drawCurrentCamera() {
        if (!this.carConfigurator.camera) return;
        
        const camX = this.carConfigurator.camera.position.x;
        const camZ = this.carConfigurator.camera.position.z;
        
        const pixelX = this.offsetX + camX * this.scale;
        const pixelY = this.offsetY + camZ * this.scale;
        
        // カメラアイコン
        this.ctx.fillStyle = 'rgba(255, 255, 0, 0.8)';
        this.ctx.beginPath();
        this.ctx.arc(pixelX, pixelY, 6, 0, Math.PI * 2);
        this.ctx.fill();
        
        // カメラの向きを表示
        this.drawCameraDirection(pixelX, pixelY, camX, camZ);
    }
    
    drawPoint(point, color, label) {
        const pixelX = this.offsetX + point.x * this.scale;
        const pixelY = this.offsetY + point.z * this.scale;
        
        // ポイント
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.arc(pixelX, pixelY, 8, 0, Math.PI * 2);
        this.ctx.fill();
        
        // ラベル
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = '12px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(label, pixelX, pixelY - 12);
    }
    
    drawPath() {
        const startPixelX = this.offsetX + this.startPoint.x * this.scale;
        const startPixelY = this.offsetY + this.startPoint.z * this.scale;
        const endPixelX = this.offsetX + this.endPoint.x * this.scale;
        const endPixelY = this.offsetY + this.endPoint.z * this.scale;
        
        // パスライン
        this.ctx.strokeStyle = 'rgba(255, 40, 0, 0.8)';
        this.ctx.lineWidth = 3;
        this.ctx.setLineDash([5, 5]);
        this.ctx.beginPath();
        this.ctx.moveTo(startPixelX, startPixelY);
        this.ctx.lineTo(endPixelX, endPixelY);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
        
        // 中間点のサンプル表示
        const steps = 5;
        for (let i = 1; i < steps; i++) {
            const t = i / steps;
            const x = startPixelX + (endPixelX - startPixelX) * t;
            const y = startPixelY + (endPixelY - startPixelY) * t;
            
            this.ctx.fillStyle = 'rgba(255, 40, 0, 0.5)';
            this.ctx.beginPath();
            this.ctx.arc(x, y, 3, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }
    
    drawCameraDirection(pixelX, pixelY, camX, camZ) {
        let angle;
        
        switch (this.cameraLookMode) {
            case 'lookAtCar':
                // 車の中心を向く
                angle = Math.atan2(-camZ, -camX);
                break;
            case 'lookForward':
                // 進行方向を向く
                if (this.startPoint && this.endPoint) {
                    const dx = this.endPoint.x - this.startPoint.x;
                    const dz = this.endPoint.z - this.startPoint.z;
                    angle = Math.atan2(dz, dx);
                } else {
                    angle = 0;
                }
                break;
            case 'parallel':
                // 平行移動（前方固定）
                angle = -Math.PI / 2; // 北向き（車の前方）
                break;
            case 'custom':
                // 終点方向を向く
                if (this.endPoint) {
                    const dx = this.endPoint.x - camX;
                    const dz = this.endPoint.z - camZ;
                    angle = Math.atan2(dz, dx);
                } else {
                    angle = 0;
                }
                break;
            case 'angle':
                // 角度指定
                angle = (this.cameraPan * Math.PI) / 180;
                break;
            default:
                angle = 0;
        }
        
        // 向きを矢印で表示
        this.ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(pixelX, pixelY);
        this.ctx.lineTo(
            pixelX + Math.cos(angle) * 20,
            pixelY + Math.sin(angle) * 20
        );
        this.ctx.stroke();
        
        // 矢印の先端
        this.ctx.beginPath();
        this.ctx.moveTo(
            pixelX + Math.cos(angle) * 20,
            pixelY + Math.sin(angle) * 20
        );
        this.ctx.lineTo(
            pixelX + Math.cos(angle - 0.3) * 15,
            pixelY + Math.sin(angle - 0.3) * 15
        );
        this.ctx.moveTo(
            pixelX + Math.cos(angle) * 20,
            pixelY + Math.sin(angle) * 20
        );
        this.ctx.lineTo(
            pixelX + Math.cos(angle + 0.3) * 15,
            pixelY + Math.sin(angle + 0.3) * 15
        );
        this.ctx.stroke();
    }
    
    updateStatus(text) {
        const statusElement = document.getElementById('editorStatus');
        if (statusElement) {
            statusElement.textContent = text;
        }
    }
    
    clearPath() {
        this.startPoint = null;
        this.endPoint = null;
        this.updateStatus('始点を選択してください');
        this.draw();
    }
    
    previewPath() {
        if (!this.startPoint || !this.endPoint) {
            alert('始点と終点を設定してください');
            return;
        }
        
        // カメラアニメーションのプレビュー実行
        log('\n========== PREVIEW PATH START ==========');
        log('Start height:', this.cameraStartHeight, 'End height:', this.cameraEndHeight);
        log('Start position:', this.startPoint);
        log('End position:', this.endPoint);
        log('Look mode:', this.cameraLookMode);
        log('========================================\n');
        
        const pathConfig = {
            start: { ...this.startPoint, y: this.cameraStartHeight },
            end: { ...this.endPoint, y: this.cameraEndHeight },
            duration: 3000 / this.animationSpeed,
            interpolation: this.interpolationType,
            lookMode: this.cameraLookMode
        };
        
        // 角度モードの場合は角度情報を追加
        if (this.cameraLookMode === 'angle') {
            pathConfig.angles = {
                pan: this.cameraPan,
                tilt: this.cameraTilt
            };
        }
        
        this.carConfigurator.previewCameraPath(pathConfig);
    }
    
    applyPath() {
        if (!this.startPoint || !this.endPoint) {
            alert('始点と終点を設定してください');
            return;
        }
        
        // 設定をJSONとして出力（将来の保存機能用）
        const pathConfig = {
            start: { ...this.startPoint, y: this.cameraStartHeight },
            end: { ...this.endPoint, y: this.cameraEndHeight },
            speed: this.animationSpeed,
            interpolation: this.interpolationType,
            lookMode: this.cameraLookMode
        };
        
        if (this.cameraLookMode === 'angle') {
            pathConfig.angles = {
                pan: this.cameraPan,
                tilt: this.cameraTilt
            };
        }
        
        log('Camera path configuration:', JSON.stringify(pathConfig, null, 2));
        alert('カメラパスが適用されました（コンソールに設定が出力されています）');
    }
    
    loadPreset(slotNumber) {
        const preset = this.presets[slotNumber];
        if (!preset) {
            alert(`プリセット${slotNumber}は保存されていません`);
            return;
        }
        
        // プリセット値を適用
        this.startPoint = { ...preset.startPoint };
        this.endPoint = { ...preset.endPoint };
        this.cameraStartHeight = preset.cameraStartHeight;
        this.cameraEndHeight = preset.cameraEndHeight;
        this.animationSpeed = preset.animationSpeed;
        this.interpolationType = preset.interpolationType;
        this.cameraLookMode = preset.cameraLookMode;
        this.cameraPan = preset.cameraPan;
        this.cameraTilt = preset.cameraTilt;
        
        // FOVも適用
        if (preset.fov !== undefined) {
            this.carConfigurator.cameraSettings.fov = preset.fov;
            this.carConfigurator.camera.fov = preset.fov;
            this.carConfigurator.camera.updateProjectionMatrix();
            
            // UIのFOVスライダーも更新
            const cameraFOVEditorSlider = document.getElementById('cameraFOVEditor');
            const cameraFOVEditorValue = document.getElementById('cameraFOVEditorValue');
            if (cameraFOVEditorSlider) cameraFOVEditorSlider.value = preset.fov;
            if (cameraFOVEditorValue) cameraFOVEditorValue.textContent = preset.fov + '°';
            
            // ガレージ設定モーダルのFOVスライダーも更新
            const cameraFOVSlider = document.getElementById('cameraFOV');
            const cameraFOVValue = document.getElementById('cameraFOVValue');
            if (cameraFOVSlider) cameraFOVSlider.value = preset.fov;
            if (cameraFOVValue) cameraFOVValue.textContent = preset.fov + '°';
        }
        
        // UIを更新
        this.updateUIValues();
        
        // 角度コントロールの表示
        const angleControls = document.getElementById('angleControls');
        if (angleControls) {
            angleControls.style.display = this.cameraLookMode === 'angle' ? 'block' : 'none';
        }
        
        this.updateStatus(`プリセット${slotNumber}を読み込みました`);
        this.draw();
        
        // プリセットボタンのスタイルを更新
        this.updatePresetButtonStyles(slotNumber);
    }
    
    savePreset() {
        if (!this.startPoint || !this.endPoint) {
            alert('始点と終点を設定してください');
            return;
        }
        
        if (!this.currentPresetSlot) {
            alert('保存先のプリセット番号を選択してください');
            return;
        }
        
        // 現在の設定を保存（FOVも含む）
        this.presets[this.currentPresetSlot] = {
            startPoint: { ...this.startPoint },
            endPoint: { ...this.endPoint },
            cameraStartHeight: this.cameraStartHeight,
            cameraEndHeight: this.cameraEndHeight,
            animationSpeed: this.animationSpeed,
            interpolationType: this.interpolationType,
            cameraLookMode: this.cameraLookMode,
            cameraPan: this.cameraPan,
            cameraTilt: this.cameraTilt,
            fov: this.carConfigurator.cameraSettings.fov
        };
        
        this.storePresets();
        alert(`プリセット${this.currentPresetSlot}に保存しました`);
        this.updateStatus(`プリセット${this.currentPresetSlot}に保存しました`);
    }
    
    /** localStorage に保存済みのプリセットがあれば上書き読み込みする */
    loadStoredPresets() {
        try {
            const raw = localStorage.getItem(STORAGE_KEYS.presets);
            if (!raw) return;
            const stored = JSON.parse(raw);
            for (const slot of [1, 2, 3]) {
                if (stored[slot] && stored[slot].startPoint && stored[slot].endPoint) {
                    this.presets[slot] = { ...this.presets[slot], ...stored[slot] };
                }
            }
        } catch (e) {
            console.warn('Failed to load camera presets', e);
        }
    }
    
    storePresets() {
        try {
            localStorage.setItem(STORAGE_KEYS.presets, JSON.stringify(this.presets));
        } catch (e) {
            console.warn('Failed to store camera presets', e);
        }
    }
    
    updatePresetButtonStyles(activeSlot = null) {
        // すべてのプリセットボタンのスタイルをリセット
        for (let i = 1; i <= 3; i++) {
            const btn = document.getElementById(`preset${i}`);
            if (btn) {
                btn.classList.remove('active');
                if (this.presets[i]) {
                    btn.classList.add('saved');
                } else {
                    btn.classList.remove('saved');
                }
            }
        }
        
        // アクティブなスロットをハイライト
        if (activeSlot) {
            const activeBtn = document.getElementById(`preset${activeSlot}`);
            if (activeBtn) {
                activeBtn.classList.add('active');
            }
            this.currentPresetSlot = activeSlot;
        }
    }
    
    testLowHeight() {
        // 低高度テスト設定
        this.startPoint = { x: -2, z: 0 };
        this.endPoint = { x: 2, z: 0 };
        this.cameraStartHeight = 0.1;  // 最低高度
        this.cameraEndHeight = 0.3;    // 低い高度
        this.animationSpeed = 0.5;     // ゆっくり
        this.interpolationType = 'linear';
        this.cameraLookMode = 'lookAtCar';
        
        // UIを更新
        this.updateUIValues();
        
        log('\n=== LOW HEIGHT TEST ===');
        log('Heights: 0.1m -> 0.3m');
        log('====================\n');
        
        this.updateStatus('低高度テスト設定を適用しました');
        this.draw();
        
        // 自動的にプレビューを開始
        setTimeout(() => this.previewPath(), 100);
    }
    
    testHighHeight() {
        // 高高度テスト設定
        this.startPoint = { x: -2, z: 0 };
        this.endPoint = { x: 2, z: 0 };
        this.cameraStartHeight = 1.0;  // 中間高度
        this.cameraEndHeight = 5.0;    // 最高高度
        this.animationSpeed = 0.5;     // ゆっくり
        this.interpolationType = 'linear';
        this.cameraLookMode = 'lookAtCar';
        
        // UIを更新
        this.updateUIValues();
        
        log('\n=== HIGH HEIGHT TEST ===');
        log('Heights: 1.0m -> 5.0m');
        log('====================\n');
        
        this.updateStatus('高高度テスト設定を適用しました');
        this.draw();
        
        // 自動的にプレビューを開始
        setTimeout(() => this.previewPath(), 100);
    }
    
    updateUIValues() {
        // 高さスライダーの更新
        const startHeightSlider = document.getElementById('cameraStartHeight');
        if (startHeightSlider) {
            startHeightSlider.value = this.cameraStartHeight;
            const startHeightValue = document.getElementById('startHeightValue');
            if (startHeightValue) startHeightValue.textContent = this.cameraStartHeight.toFixed(1);
        }
        
        const endHeightSlider = document.getElementById('cameraEndHeight');
        if (endHeightSlider) {
            endHeightSlider.value = this.cameraEndHeight;
            const endHeightValue = document.getElementById('endHeightValue');
            if (endHeightValue) endHeightValue.textContent = this.cameraEndHeight.toFixed(1);
        }
        
        const speedSlider = document.getElementById('cameraSpeed');
        if (speedSlider) {
            speedSlider.value = this.animationSpeed;
            const speedValue = document.getElementById('speedValue');
            if (speedValue) speedValue.textContent = this.animationSpeed.toFixed(1);
        }
        
        const interpolationType = document.getElementById('interpolationType');
        if (interpolationType) interpolationType.value = this.interpolationType;
        
        const cameraLookMode = document.getElementById('cameraLookMode');
        if (cameraLookMode) cameraLookMode.value = this.cameraLookMode;
    }
}

const configurator = new CarConfigurator();
window.configurator = configurator;
