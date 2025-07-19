import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

class CarConfigurator {
    constructor() {
        console.log('\n\n========== CarConfigurator Constructor Started ==========');
        console.log('Document readyState:', document.readyState);
        console.log('Document body:', document.body);
        
        this.container = document.getElementById('canvas-container');
        this.loadingScreen = document.getElementById('loading');
        
        console.log('Canvas container found:', this.container);
        console.log('Loading screen found:', this.loadingScreen);
        
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.carModel = null;
        this.loadedModels = {}; // 読み込み済みモデルを保存
        this.carParts = {
            body: [],
            wheels: [],
            interior: [],
            glass: [],
            paintBody: [] // Add paintBody to carParts
        };
        
        this.currentConfig = {
            carModel: 'DaimlerV8'
        };
        
        this.availableCars = {
            'DaimlerV8': './Assets/DaimlerV8.glb',
            'JaguarXJ8': './Assets/JaguarXJ8.glb',
            'JaguarXJR': './Assets/JaguarXJR.glb',
            'JaguarSuperV8': './Assets/JaguarSuperV8.glb',
            'JaguarXJSovereign': './Assets/JaguarXJSovereign.glb',
            'JaguarXJSports': './Assets/JaguarXJSports.glb'
        };
        
        // ガレージの設定
        this.garageSettings = {
            scale: 0.5,
            height: 0.6,
            x: 1.3,
            z: 1.0,
            rotation: 0,
            shadowFloorY: 0.03  // 影受け床のY位置オフセット
        };
        this.garageModel = null;
        this.shadowFloor = null;  // 影受け専用床の参照
        
        // カメラ設定
        this.cameraSettings = {
            fov: 30
        };
        
        this.cameraPositions = {
            front: { x: -3, y: 1.2, z: -3 },  // フロントビュー（車の前方）
            side: { x: 3.5, y: 1.2, z: 0 },
            rear: { x: 3, y: 1.2, z: 3 }      // リアビュー（車の後方）
        };
        
        this.loadingProgress = {
            total: Object.keys(this.availableCars).length,
            loaded: 0
        };
        
        // アニメーション関連のプロパティ
        this.moviePlaying = false;
        this.animationProgress = 0;
        this.animationDuration = 30000; // 30秒
        this.animationStartTime = 0;
        this.animationId = null;
        
        // カメラエディター関連のプロパティ
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
        this.loadEnvironment();
        this.preloadAllModels();
        this.animate();
        
        // DOMが完全に読み込まれた後にイベントリスナーとUIを初期化
        console.log('Setting up DOM-dependent features...');
        console.log('Current readyState:', document.readyState);
        
        // 少し遅延させて実行
        setTimeout(() => {
            console.log('\n=== Delayed initialization start ===');
            this.setupEventListeners();
            this.setupCameraEditor();
            this.initializeUI();
            console.log('=== Delayed initialization complete ===\n');
        }, 100);
    }
    
    setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000);
        this.scene.fog = new THREE.Fog(0x000000, 10, 50);
        
    }
    
    setupCamera() {
        const aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(30, aspect, 0.1, 100);
        // フロントビューを初期位置に設定
        this.camera.position.set(-3, 1.2, -3);
        console.log('Camera initialized - FOV:', this.camera.fov, 'Position:', this.camera.position.toArray());
    }
    
    setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            alpha: true 
        });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        
        this.container.appendChild(this.renderer.domElement);
    }
    
    setupLighting() {
        // ガレージ環境に適した照明
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
        this.scene.add(ambientLight);
        
        // メインの方向光（天窓からの光を模擬）
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
        directionalLight.position.set(2, 10, 2);
        directionalLight.castShadow = true;
        directionalLight.shadow.camera.near = 0.1;
        directionalLight.shadow.camera.far = 30;
        directionalLight.shadow.camera.left = -8;
        directionalLight.shadow.camera.right = 8;
        directionalLight.shadow.camera.top = 8;
        directionalLight.shadow.camera.bottom = -8;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.bias = -0.001;
        this.scene.add(directionalLight);
        
        // 影をデバッグ用に可視化（開発時のみ）
        // const helper = new THREE.CameraHelper(directionalLight.shadow.camera);
        // this.scene.add(helper);
        
        // 車にフォーカスしたスポットライト
        const spotLight1 = new THREE.SpotLight(0xffffff, 0.7);
        spotLight1.position.set(-5, 5, 3);
        spotLight1.target.position.set(0, 0.5, 0);
        spotLight1.angle = Math.PI / 6;
        spotLight1.penumbra = 0.5;
        spotLight1.castShadow = true;
        spotLight1.shadow.mapSize.width = 1024;
        spotLight1.shadow.mapSize.height = 1024;
        this.scene.add(spotLight1);
        this.scene.add(spotLight1.target);
        
        const spotLight2 = new THREE.SpotLight(0xffffff, 0.7);
        spotLight2.position.set(5, 5, -3);
        spotLight2.target.position.set(0, 0.5, 0);
        spotLight2.angle = Math.PI / 6;
        spotLight2.penumbra = 0.5;
        spotLight2.castShadow = true;
        spotLight2.shadow.mapSize.width = 1024;
        spotLight2.shadow.mapSize.height = 1024;
        this.scene.add(spotLight2);
        this.scene.add(spotLight2.target);
        
        // ガレージの天井灯風のポイントライト
        const pointLight1 = new THREE.PointLight(0xffffff, 0.3, 10);
        pointLight1.position.set(0, 4, 5);
        this.scene.add(pointLight1);
        
        const pointLight2 = new THREE.PointLight(0xffffff, 0.3, 10);
        pointLight2.position.set(0, 4, -5);
        this.scene.add(pointLight2);
        
        
        console.log('Lighting setup complete');
    }
    
    loadGarage() {
        const loader = new GLTFLoader();
        loader.load(
            './Assets/ScifiGarage.glb',
            (gltf) => {
                const garage = gltf.scene;
                this.garageModel = garage;
                
                // ガレージのスケールと位置を初期値で設定
                this.updateGarageTransform();
                
                // 影の設定
                garage.traverse((child) => {
                    if (child.isMesh) {
                        // ガレージ全体は影を落とすが受けない（影受けは専用床に任せる）
                        child.castShadow = true;
                        child.receiveShadow = false;
                        
                        // マテリアルの調整
                        if (child.material) {
                            child.material.envMapIntensity = 0.5;
                        }
                    }
                });
                
                this.scene.add(garage);
                console.log('Garage loaded successfully');
                
                // ガレージが読み込まれたら、フォールバックの床とグリッドを非表示
                if (this.floorMesh) this.floorMesh.visible = false;
                if (this.gridHelper) this.gridHelper.visible = false;
            },
            (progress) => {
                console.log('Loading garage:', (progress.loaded / progress.total * 100) + '%');
            },
            (error) => {
                console.error('Error loading garage:', error);
                // エラーの場合はフォールバックの床を表示
                if (this.floorMesh) this.floorMesh.visible = true;
                if (this.gridHelper) this.gridHelper.visible = true;
            }
        );
    }
    
    updateGarageTransform() {
        if (!this.garageModel) return;
        
        const scale = this.garageSettings.scale;
        this.garageModel.scale.set(scale, scale, scale);
        this.garageModel.position.set(
            this.garageSettings.x,
            this.garageSettings.height,
            this.garageSettings.z
        );
        this.garageModel.rotation.y = this.garageSettings.rotation * Math.PI / 180;
        
        // 影受け床もガレージに合わせて更新
        if (this.shadowFloor) {
            this.shadowFloor.position.set(
                this.garageSettings.x,
                this.garageSettings.shadowFloorY,
                this.garageSettings.z
            );
            this.shadowFloor.rotation.y = this.garageSettings.rotation * Math.PI / 180;
            // スケールも調整（ガレージサイズに合わせる）
            const floorScale = scale * 1.2;
            this.shadowFloor.scale.set(floorScale, floorScale, floorScale);
        }
    }
    
    setupControls() {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 1.5;
        this.controls.maxDistance = 8;
        this.controls.maxPolarAngle = Math.PI / 2;
        this.controls.target.set(0, 0.5, 0);
        this.controls.update();
    }
    
    loadEnvironment() {
        const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
        pmremGenerator.compileEquirectangularShader();
        
        new RGBELoader()
            .load('https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/equirectangular/quarry_01_1k.hdr', (texture) => {
                const envMap = pmremGenerator.fromEquirectangular(texture).texture;
                this.scene.environment = envMap;
                texture.dispose();
                pmremGenerator.dispose();
            });
        
        // パーキングガレージを読み込み
        this.loadGarage();
        
        // コンクリート調の床（ガレージモデルがない場合のフォールバック）
        const floorGeometry = new THREE.PlaneGeometry(20, 20);
        const floorMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x4a4a4a,
            roughness: 0.95,
            metalness: 0.05,
            normalScale: new THREE.Vector2(0.5, 0.5)
        });
        
        const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
        floorMesh.rotation.x = -Math.PI / 2;
        floorMesh.receiveShadow = true;
        floorMesh.visible = false; // ガレージがある場合は非表示
        this.floorMesh = floorMesh;
        
        // グリッドラインを追加（駐車場のライン風）
        const gridHelper = new THREE.GridHelper(20, 10, 0x555555, 0x333333);
        gridHelper.position.y = 0.01;
        gridHelper.visible = false; // ガレージがある場合は非表示
        this.gridHelper = gridHelper;
        
        this.scene.add(floorMesh);
        this.scene.add(gridHelper);
        
        // 影受け専用の透明な大きな床を追加
        const shadowFloorGeometry = new THREE.PlaneGeometry(20, 20);
        const shadowFloorMaterial = new THREE.ShadowMaterial({ 
            opacity: 0.3,
            color: 0x000000,
            transparent: true
        });
        this.shadowFloor = new THREE.Mesh(shadowFloorGeometry, shadowFloorMaterial);
        this.shadowFloor.rotation.x = -Math.PI / 2;
        this.shadowFloor.position.y = this.garageSettings.shadowFloorY;
        this.shadowFloor.receiveShadow = true;
        this.scene.add(this.shadowFloor);
        
    }
    
    preloadAllModels() {
        console.log('Starting preload of all car models...');
        this.updateLoadingText(`Loading car models... 0/${this.loadingProgress.total}`);
        
        const promises = Object.entries(this.availableCars).map(([carName, modelPath]) => {
            return this.preloadModel(carName, modelPath);
        });
        
        Promise.all(promises).then(() => {
            console.log('All models preloaded successfully!');
            // 最初の車を表示
            this.displayCar(this.currentConfig.carModel);
            this.hideLoading();
        }).catch((error) => {
            console.error('Error preloading models:', error);
            this.hideLoading();
        });
    }
    
    preloadModel(carName, modelPath) {
        return new Promise((resolve, reject) => {
            const loader = new GLTFLoader();
            
            loader.load(
                modelPath,
                (gltf) => {
                    // モデルを保存
                    this.loadedModels[carName] = gltf.scene.clone();
                    this.loadingProgress.loaded++;
                    this.updateLoadingText(`Loading car models... ${this.loadingProgress.loaded}/${this.loadingProgress.total}`);
                    console.log(`Preloaded: ${carName}`);
                    resolve();
                },
                (progress) => {
                    // 個別の進捗は表示しない
                },
                (error) => {
                    console.error(`Error loading ${carName}:`, error);
                    reject(error);
                }
            );
        });
    }
    
    updateLoadingText(text) {
        const loadingText = this.loadingScreen.querySelector('p');
        if (loadingText) {
            loadingText.textContent = text;
        }
    }
    
    loadCarModel(modelName = null) {
        const carToLoad = modelName || this.currentConfig.carModel;
        const modelPath = this.availableCars[carToLoad];
        
        if (!modelPath) {
            console.error('Invalid car model:', carToLoad);
            return;
        }
        
        // ローディング画面を表示
        this.loadingScreen.style.display = 'flex';
        
        // 既存の車モデルを削除
        if (this.carModel) {
            this.scene.remove(this.carModel);
            this.carModel = null;
            this.carParts = {
                body: [],
                wheels: [],
                interior: [],
                glass: [],
                paintBody: []
            };
        }
        
        const loader = new GLTFLoader();
        
        loader.load(
            modelPath,
            (gltf) => {
                this.carModel = gltf.scene;
                
                // モデルのスケールと位置を調整
                this.carModel.scale.set(0.5, 0.5, 0.5);
                this.carModel.position.set(0, 0, 0.5);
                
                // デバッグ用：モデル構造をコンソールに出力
                console.log(`=== ${carToLoad} Model Structure ===`);
                const modelStructure = [];
                const materialInfo = [];
                
                // モデル内のパーツを分類
                this.carModel.traverse((child) => {
                    if (child.isMesh || child.isGroup) {
                        modelStructure.push({
                            name: child.name,
                            type: child.type,
                            hasMaterial: !!child.material,
                            materialType: child.material ? child.material.type : 'N/A',
                            position: child.position.clone(),
                            parent: child.parent ? child.parent.name : 'root'
                        });
                    }
                    
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                        
                        const name = child.name.toLowerCase();
                        
                        // マテリアル情報を収集
                        if (child.material) {
                            const materials = Array.isArray(child.material) ? child.material : [child.material];
                            materials.forEach((mat, index) => {
                                materialInfo.push({
                                    meshName: child.name,
                                    materialName: mat.name || 'unnamed',
                                    materialIndex: index,
                                    materialType: mat.type,
                                    hasMap: !!mat.map,
                                    mapType: mat.map ? mat.map.type : 'none',
                                    color: mat.color ? `#${mat.color.getHexString()}` : 'none',
                                    metalness: mat.metalness,
                                    roughness: mat.roughness,
                                    opacity: mat.opacity,
                                    transparent: mat.transparent
                                });
                            });
                        }
                        
                        // paintBody専用パーツの識別（色変更対象）
                        // パーツ名またはマテリアル名に"paint"または"ペイント"を含む
                        let isPaintPart = false;
                        
                        if (name.includes('paint') || name.includes('ペイント')) {
                            isPaintPart = true;
                        } else if (child.material) {
                            // マテリアル名をチェック
                            const materials = Array.isArray(child.material) ? child.material : [child.material];
                            materials.forEach(mat => {
                                if (mat.name && (mat.name.toLowerCase().includes('paint') || 
                                    mat.name.includes('ペイント'))) {
                                    isPaintPart = true;
                                    console.log('Found paint material:', mat.name, 'on mesh:', child.name);
                                }
                            });
                        }
                        
                        if (isPaintPart) {
                            this.carParts.paintBody.push(child);
                            console.log('Paint body part found:', child.name);
                        }
                        
                        // ボディパーツの識別 - より広範な条件で識別
                        const isBodyPart = name.includes('body') || name.includes('chassis') || 
                            name.includes('paint') || name.includes('exterior') ||
                            name.includes('hood') || name.includes('trunk') ||
                            name.includes('bumper') || name.includes('fender') ||
                            name.includes('panel') || name.includes('shell') ||
                            // 除外条件: ガラス、ホイール、インテリア、ライトではない
                            (!name.includes('glass') && !name.includes('window') && 
                             !name.includes('wheel') && !name.includes('tire') && 
                             !name.includes('interior') && !name.includes('seat') &&
                             !name.includes('light') && !name.includes('lamp') &&
                             child.material && child.material.color);
                        
                        if (isBodyPart) {
                            this.carParts.body.push(child);
                            console.log('Body part found:', child.name);
                        }
                        
                        // ドアパーツの識別（新規追加）
                        if (name.includes('door') || name.includes('ドア')) {
                            if (!this.carParts.doors) this.carParts.doors = [];
                            this.carParts.doors.push(child);
                            console.log('Found door:', child.name);
                        }
                        
                        // ホイールパーツの識別
                        if (name.includes('wheel') || name.includes('tire') || 
                            name.includes('rim') || name.includes('alloy')) {
                            this.carParts.wheels.push(child);
                            console.log('Wheel part found:', child.name);
                            
                            // ホイールのマテリアルを調整
                            if (child.material) {
                                const materials = Array.isArray(child.material) ? child.material : [child.material];
                                materials.forEach((mat, index) => {
                                    console.log(`- Wheel material ${index}: ${mat.type}, name: ${mat.name}, color: ${mat.color ? mat.color.getHexString() : 'none'}`);
                                    
                                    // Rim.003マテリアルの特別処理
                                    if (mat.name === 'Rim.003') {
                                        console.log('Found Rim.003 material - applying special metallic treatment');
                                        mat.color = new THREE.Color(0x707070); // より暗めのグレー
                                        mat.metalness = 0.95;
                                        mat.roughness = 0.15;
                                        mat.envMapIntensity = 1.5;
                                    }
                                    // タイヤとリムを区別して処理
                                    else if (name.includes('tire') || name.includes('tyre')) {
                                        // タイヤ：黒っぽく
                                        mat.color = new THREE.Color(0x1a1a1a);
                                        mat.metalness = 0;
                                        mat.roughness = 0.9;
                                    } else if (name.includes('rim') || name.includes('alloy') || name.includes('wheel')) {
                                        // リム：メタリックに
                                        mat.color = new THREE.Color(0x888888);
                                        mat.metalness = 0.9;
                                        mat.roughness = 0.2;
                                    }
                                    mat.needsUpdate = true;
                                });
                            }
                        }
                        
                        // インテリアパーツの識別
                        if (name.includes('interior') || name.includes('seat') || 
                            name.includes('dashboard') || name.includes('steering')) {
                            this.carParts.interior.push(child);
                        }
                        
                        // ガラスパーツの識別
                        if (name.includes('glass') || name.includes('window') || 
                            name.includes('windshield')) {
                            this.carParts.glass.push(child);
                            if (child.material) {
                                child.material.transparent = true;
                                child.material.opacity = child.material.opacity || 0.7;
                            }
                        }
                        
                        // ライトパーツの識別（新規追加）
                        if (name.includes('light') || name.includes('lamp') ||
                            name.includes('headlight') || name.includes('taillight')) {
                            if (!this.carParts.lights) this.carParts.lights = [];
                            this.carParts.lights.push(child);
                        }
                    }
                });
                
                // モデル構造をコンソールに表示
                console.table(modelStructure);
                console.log('Car parts summary:');
                console.log('- Body parts:', this.carParts.body.length);
                console.log('- Wheel parts:', this.carParts.wheels.length);
                console.log('- Interior parts:', this.carParts.interior.length);
                console.log('- Glass parts:', this.carParts.glass.length);
                console.log('- Door parts:', this.carParts.doors ? this.carParts.doors.length : 0);
                console.log('- Light parts:', this.carParts.lights ? this.carParts.lights.length : 0);
                console.log('- Paint Body parts:', this.carParts.paintBody.length); // Log paintBody parts
                
                // マテリアル情報を表示
                console.log('\n=== Material Information ===');
                console.table(materialInfo);
                
                // テクスチャがない場合の警告
                const hasTextures = materialInfo.some(mat => mat.hasMap);
                if (!hasTextures) {
                    console.warn('警告: このモデルにはテクスチャマップが含まれていません。');
                }
                
                this.scene.add(this.carModel);
                
                // Jaguarモデルのマテリアル修正を無効化（不適切な緑色になるため）
                // if (carToLoad === 'JaguarXJR') {
                //     console.log('Jaguar XJR用のマテリアル調整を実行中...');
                //     this.fixJaguarMaterials();
                // }
                
                this.hideLoading();
                
                // カメラ位置の調整（フロントビューに）
                this.camera.position.set(-3, 1.2, -3);
                this.controls.target.set(0, 0.5, 0);
                this.controls.update();
            },
            (progress) => {
                const percent = (progress.loaded / progress.total) * 100;
                console.log(`Loading ${carToLoad}: ${percent.toFixed(0)}%`);
            },
            (error) => {
                console.error(`Error loading ${carToLoad} model:`, error);
                this.hideLoading();
                alert('モデルの読み込みに失敗しました。ファイルパスを確認してください。');
            }
        );
    }
    
    hideLoading() {
        setTimeout(() => {
            this.loadingScreen.style.display = 'none';
        }, 500);
    }
    
    fixJaguarMaterials() {
        this.carModel.traverse((child) => {
            if (child.isMesh && child.material) {
                const name = child.name.toLowerCase();
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                
                materials.forEach((mat, index) => {
                    // マテリアルが正しく表示されるように調整
                    if (mat.type === 'MeshStandardMaterial' || mat.type === 'MeshPhysicalMaterial') {
                        // ボディパーツの判定
                        const isBody = name.includes('cube012') && index === 0;
                        const isChrome = name.includes('cube012') && (index === 1 || index === 2);
                        const isGlass = mat.transparent || mat.opacity < 1;
                        const isBrake = name.includes('brake');
                        const isWheel = name.includes('circle');
                        
                        if (isBody) {
                            // ボディ色をジャガーグリーンに
                            mat.color = new THREE.Color(0x1B4332);
                            mat.metalness = 0.9;
                            mat.roughness = 0.2;
                        } else if (isChrome) {
                            // クロームパーツ
                            mat.color = new THREE.Color(0xffffff);
                            mat.metalness = 1.0;
                            mat.roughness = 0.05;
                        } else if (isGlass) {
                            // ガラスパーツ
                            mat.color = new THREE.Color(0x88aaff);
                            mat.metalness = 0.1;
                            mat.roughness = 0;
                            mat.transparent = true;
                            mat.opacity = 0.4;
                        } else if (isBrake) {
                            // ブレーキ
                            mat.color = new THREE.Color(0xff0000);
                            mat.metalness = 0.8;
                            mat.roughness = 0.3;
                        } else if (isWheel) {
                            // ホイール
                            if (mat.metalness > 0.5) {
                                // リム部分
                                mat.color = new THREE.Color(0xcccccc);
                                mat.metalness = 0.95;
                                mat.roughness = 0.1;
                            } else {
                                // タイヤ部分
                                mat.color = new THREE.Color(0x1a1a1a);
                                mat.metalness = 0;
                                mat.roughness = 0.9;
                            }
                        } else if (mat.color.getHex() === 0x000000) {
                            // 純黒色の部分をダークグレーに
                            mat.color = new THREE.Color(0x1a1a1a);
                            mat.roughness = 0.8;
                        }
                        
                        // 環境マップの反射を有効化
                        mat.envMapIntensity = mat.metalness > 0.5 ? 1.5 : 0.5;
                        
                        // マテリアルを更新
                        mat.needsUpdate = true;
                    }
                });
            }
        });
        
        console.log('Jaguarのマテリアル調整が完了しました。');
    }
    
    changePaintColor(color) {
        console.log('Changing paint color to:', color);
        console.log('Paint body parts count:', this.carParts.paintBody.length);
        
        if (this.carParts.paintBody.length === 0) {
            console.warn('No paint body parts found. Checking all mesh names...');
            // デバッグ: すべてのメッシュ名を出力
            this.carModel.traverse((child) => {
                if (child.isMesh) {
                    console.log('Mesh name:', child.name);
                }
            });
        }
        
        this.carParts.paintBody.forEach(part => {
            console.log('Updating paint for:', part.name);
            if (part.material) {
                // マテリアルが配列の場合も考慮
                const materials = Array.isArray(part.material) ? part.material : [part.material];
                materials.forEach((mat, index) => {
                    console.log(`- Material ${index} type:`, mat.type);
                    // 直接色を設定
                    if (mat.color) {
                        mat.color.set(color);
                        mat.needsUpdate = true;
                        console.log('- Color updated to:', color);
                    }
                });
            }
        });
        
        // レンダラーを強制更新
        if (this.renderer) {
            this.renderer.render(this.scene, this.camera);
        }
    }
    
    changeCar(carName) {
        if (this.availableCars[carName]) {
            this.currentConfig.carModel = carName;
            this.displayCar(carName);
        }
    }
    
    displayCar(carName) {
        // 既存の車モデルを削除
        if (this.carModel) {
            this.scene.remove(this.carModel);
            this.carModel = null;
            this.carParts = {
                body: [],
                wheels: [],
                interior: [],
                glass: [],
                paintBody: []
            };
        }
        
        // 事前読み込み済みのモデルを使用
        if (this.loadedModels[carName]) {
            this.carModel = this.loadedModels[carName].clone();
            
            // モデルのスケールと位置を調整
            this.carModel.scale.set(0.5, 0.5, 0.5);
            this.carModel.position.set(0, 0, 0.5);
            
            // モデル処理
            this.processCarModel(carName);
            
            this.scene.add(this.carModel);
            
            // カメラ位置の調整（フロントビューに）
            this.camera.position.set(-3, 1.2, -3);
            this.controls.target.set(0, 0.5, 0);
            this.controls.update();
        } else {
            console.error('Model not preloaded:', carName);
        }
    }
    
    processCarModel(carName) {
        // デバッグ用：モデル構造をコンソールに出力
        console.log(`=== ${carName} Model Structure ===`);
        const modelStructure = [];
        const materialInfo = [];
        
        // モデル内のパーツを分類
        this.carModel.traverse((child) => {
            if (child.isMesh || child.isGroup) {
                modelStructure.push({
                    name: child.name,
                    type: child.type,
                    hasMaterial: !!child.material,
                    materialType: child.material ? child.material.type : 'N/A',
                    position: child.position.clone(),
                    parent: child.parent ? child.parent.name : 'root'
                });
            }
            
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                
                const name = child.name.toLowerCase();
                
                // マテリアル情報を収集
                if (child.material) {
                    const materials = Array.isArray(child.material) ? child.material : [child.material];
                    materials.forEach((mat, index) => {
                        materialInfo.push({
                            meshName: child.name,
                            materialName: mat.name || 'unnamed',
                            materialIndex: index,
                            materialType: mat.type,
                            hasMap: !!mat.map,
                            mapType: mat.map ? mat.map.type : 'none',
                            color: mat.color ? `#${mat.color.getHexString()}` : 'none',
                            metalness: mat.metalness,
                            roughness: mat.roughness,
                            opacity: mat.opacity,
                            transparent: mat.transparent
                        });
                    });
                }
                
                // paintBody専用パーツの識別（色変更対象）
                let isPaintPart = false;
                
                if (name.includes('paint') || name.includes('ペイント')) {
                    isPaintPart = true;
                } else if (child.material) {
                    // マテリアル名をチェック
                    const materials = Array.isArray(child.material) ? child.material : [child.material];
                    materials.forEach(mat => {
                        if (mat.name && (mat.name.toLowerCase().includes('paint') || 
                            mat.name.includes('ペイント'))) {
                            isPaintPart = true;
                            console.log('Found paint material:', mat.name, 'on mesh:', child.name);
                        }
                    });
                }
                
                if (isPaintPart) {
                    this.carParts.paintBody.push(child);
                    console.log('Paint body part found:', child.name);
                }
                
                // ボディパーツの識別
                const isBodyPart = name.includes('body') || name.includes('chassis') || 
                    name.includes('paint') || name.includes('exterior') ||
                    name.includes('hood') || name.includes('trunk') ||
                    name.includes('bumper') || name.includes('fender') ||
                    name.includes('panel') || name.includes('shell') ||
                    (!name.includes('glass') && !name.includes('window') && 
                     !name.includes('wheel') && !name.includes('tire') && 
                     !name.includes('interior') && !name.includes('seat') &&
                     !name.includes('light') && !name.includes('lamp') &&
                     child.material && child.material.color);
                
                if (isBodyPart) {
                    this.carParts.body.push(child);
                    console.log('Body part found:', child.name);
                }
                
                // ドアパーツの識別
                if (name.includes('door') || name.includes('ドア')) {
                    if (!this.carParts.doors) this.carParts.doors = [];
                    this.carParts.doors.push(child);
                    console.log('Found door:', child.name);
                }
                
                // ホイールパーツの識別
                if (name.includes('wheel') || name.includes('tire') || 
                    name.includes('rim') || name.includes('alloy')) {
                    this.carParts.wheels.push(child);
                    console.log('Wheel part found:', child.name);
                    
                    // ホイールのマテリアルを調整
                    if (child.material) {
                        const materials = Array.isArray(child.material) ? child.material : [child.material];
                        materials.forEach((mat, index) => {
                            console.log(`- Wheel material ${index}: ${mat.type}, name: ${mat.name}, color: ${mat.color ? mat.color.getHexString() : 'none'}`);
                            
                            // Rim.003マテリアルの特別処理
                            if (mat.name === 'Rim.003') {
                                console.log('Found Rim.003 material - applying special metallic treatment');
                                mat.color = new THREE.Color(0x707070); // より暗めのグレー
                                mat.metalness = 0.95;
                                mat.roughness = 0.15;
                                mat.envMapIntensity = 1.5;
                            }
                            // タイヤとリムを区別して処理
                            else if (name.includes('tire') || name.includes('tyre')) {
                                // タイヤ：黒っぽく
                                mat.color = new THREE.Color(0x1a1a1a);
                                mat.metalness = 0;
                                mat.roughness = 0.9;
                            } else if (name.includes('rim') || name.includes('alloy') || name.includes('wheel')) {
                                // リム：メタリックに
                                mat.color = new THREE.Color(0x888888);
                                mat.metalness = 0.9;
                                mat.roughness = 0.2;
                            }
                            mat.needsUpdate = true;
                        });
                    }
                }
                
                // インテリアパーツの識別
                if (name.includes('interior') || name.includes('seat') || 
                    name.includes('dashboard') || name.includes('steering')) {
                    this.carParts.interior.push(child);
                }
                
                // ガラスパーツの識別
                if (name.includes('glass') || name.includes('window') || 
                    name.includes('windshield')) {
                    this.carParts.glass.push(child);
                    if (child.material) {
                        child.material.transparent = true;
                        child.material.opacity = child.material.opacity || 0.7;
                    }
                }
                
                // ライトパーツの識別
                if (name.includes('light') || name.includes('lamp') ||
                    name.includes('headlight') || name.includes('taillight')) {
                    if (!this.carParts.lights) this.carParts.lights = [];
                    this.carParts.lights.push(child);
                }
            }
        });
        
        // モデル構造をコンソールに表示
        console.table(modelStructure);
        console.log('Car parts summary:');
        console.log('- Body parts:', this.carParts.body.length);
        console.log('- Wheel parts:', this.carParts.wheels.length);
        console.log('- Interior parts:', this.carParts.interior.length);
        console.log('- Glass parts:', this.carParts.glass.length);
        console.log('- Door parts:', this.carParts.doors ? this.carParts.doors.length : 0);
        console.log('- Light parts:', this.carParts.lights ? this.carParts.lights.length : 0);
        console.log('- Paint Body parts:', this.carParts.paintBody.length);
        
        // マテリアル情報を表示
        console.log('\n=== Material Information ===');
        console.table(materialInfo);
        
        // テクスチャがない場合の警告
        const hasTextures = materialInfo.some(mat => mat.hasMap);
        if (!hasTextures) {
            console.warn('警告: このモデルにはテクスチャマップが含まれていません。');
        }
    }
    
    
    
    setCameraView(view) {
        const position = this.cameraPositions[view];
        if (position) {
            this.camera.position.set(position.x, position.y, position.z);
            this.controls.target.set(0, 0.5, 0);
            this.controls.update();
        }
    }
    
    setupEventListeners() {
        console.log('\n=== Setting up event listeners ===');
        
        // まず全てのタブボタンを確認
        const allTabButtons = document.querySelectorAll('.tab-btn');
        console.log('All tab buttons in DOM:', allTabButtons.length);
        allTabButtons.forEach((btn, index) => {
            console.log(`Tab button ${index}: ${btn.dataset.tab}, classes: ${btn.className}`);
        });
        
        // タブナビゲーション - イベントデリゲーションを使用
        const tabNavigation = document.querySelector('.tab-navigation');
        console.log('Tab navigation element:', tabNavigation);
        console.log('Tab navigation HTML:', tabNavigation?.outerHTML.substring(0, 100) + '...');
        
        if (tabNavigation) {
            // 本来のリスナー
            tabNavigation.addEventListener('click', (e) => {
                console.log('\n--- Tab navigation clicked ---');
                console.log('Event target:', e.target);
                console.log('Event target classes:', e.target.className);
                
                const btn = e.target.closest('.tab-btn');
                console.log('Closest .tab-btn:', btn);
                
                if (!btn) {
                    console.log('No tab button found, returning');
                    return;
                }
                
                const tabName = btn.dataset.tab;
                console.log('Tab name from dataset:', tabName);
                
                // タブボタンのアクティブ状態を更新
                const allTabButtons = document.querySelectorAll('.tab-btn');
                console.log('All tab buttons found:', allTabButtons.length);
                allTabButtons.forEach(b => {
                    console.log(`Removing active from: ${b.dataset.tab}`);
                    b.classList.remove('active');
                });
                btn.classList.add('active');
                console.log('Added active to:', btn.dataset.tab);
                
                // タブパネルの表示を切り替え
                const allPanels = document.querySelectorAll('.tab-panel');
                console.log('All tab panels found:', allPanels.length);
                allPanels.forEach(panel => {
                    console.log(`Panel ${panel.id} - removing active`);
                    panel.classList.remove('active');
                });
                
                const targetPanelId = `${tabName}-panel`;
                console.log('Looking for panel with ID:', targetPanelId);
                const targetPanel = document.getElementById(targetPanelId);
                console.log('Target panel found:', targetPanel);
                
                if (targetPanel) {
                    targetPanel.classList.add('active');
                    console.log('Added active class to panel:', targetPanelId);
                    console.log('Panel classList after:', targetPanel.classList.toString());
                    
                    // パネルの表示状態を確認
                    const computedStyle = window.getComputedStyle(targetPanel);
                    console.log('Panel display style:', computedStyle.display);
                    console.log('Panel visibility:', computedStyle.visibility);
                    console.log('Panel opacity:', computedStyle.opacity);
                } else {
                    console.error('Target panel not found!');
                }
                
                console.log('--- Tab switch complete ---\n');
            });
        } else {
            console.error('Tab navigation element not found!');
        }
        
        // デバッグ用のコードは削除し、正常な動作に戻す
        
        // ムービーボタン（下部のタブ内）
        const movieBtn = document.getElementById('playMovie');
        if (movieBtn) {
            movieBtn.addEventListener('click', () => {
                if (this.moviePlaying) {
                    this.stopMovie();
                } else {
                    this.playMovie();
                }
            });
        }
        
        // ムービーボタン（右上）
        const movieBtnTop = document.getElementById('playMovieTop');
        if (movieBtnTop) {
            movieBtnTop.addEventListener('click', () => {
                if (this.moviePlaying) {
                    this.stopMovie();
                } else {
                    this.playMovie();
                }
            });
        }
        
        // モデル選択カード - イベントデリゲーション
        const modelGrid = document.querySelector('.model-grid');
        if (modelGrid) {
            modelGrid.addEventListener('click', (e) => {
                const card = e.target.closest('.model-card');
                if (!card) return;
                
                console.log('Model card clicked:', card.dataset.car);
                document.querySelectorAll('.model-card').forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                this.changeCar(card.dataset.car);
            });
        }
        
        // カラーオプション - イベントデリゲーション
        const colorGrid = document.querySelector('.color-grid');
        if (colorGrid) {
            colorGrid.addEventListener('click', (e) => {
                const option = e.target.closest('.color-option');
                if (!option) return;
                
                console.log('Color option clicked:', option.dataset.color);
                const color = option.dataset.color;
                document.querySelectorAll('.color-option').forEach(o => o.classList.remove('active'));
                option.classList.add('active');
                this.changePaintColor(color);
                
                // カラーピッカーも更新
                const colorPicker = document.getElementById('bodyColorPicker');
                if (colorPicker) {
                    colorPicker.value = color;
                }
            });
        }
        
        // カスタムカラーピッカー
        const colorPicker = document.getElementById('bodyColorPicker');
        if (colorPicker) {
            colorPicker.addEventListener('input', (e) => {
                this.changePaintColor(e.target.value);
                // アクティブなカラーオプションを解除
                document.querySelectorAll('.color-option').forEach(o => o.classList.remove('active'));
            });
        }
        
        // ビューボタン - イベントデリゲーション
        const viewPresets = document.querySelector('.view-presets');
        if (viewPresets) {
            viewPresets.addEventListener('click', (e) => {
                const btn = e.target.closest('.view-btn');
                if (!btn) return;
                
                console.log('View button clicked:', btn.dataset.view);
                this.setCameraView(btn.dataset.view);
            });
        }
        
        window.addEventListener('resize', () => {
            const width = this.container.clientWidth;
            const height = this.container.clientHeight;
            
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
            
            this.renderer.setSize(width, height);
        });
        
        // キーボードショートカット
        window.addEventListener('keydown', (e) => {
            if (e.ctrlKey) {
                if (e.key === 'c') {
                    e.preventDefault(); // コピー操作を無効化
                    const modal = document.getElementById('editorModal');
                    if (modal) {
                        modal.classList.add('active');
                        // エディターを初期化（まだ初期化されていない場合）
                        if (!this.cameraEditor) {
                            this.setupCameraEditor();
                        }
                    }
                } else if (e.key === 'g') {
                    e.preventDefault();
                    const garageModal = document.getElementById('garageModal');
                    if (garageModal) {
                        garageModal.classList.add('active');
                    }
                }
            }
        });
        
        // モーダルを閉じる
        const closeModal = document.getElementById('closeModal');
        if (closeModal) {
            closeModal.addEventListener('click', () => {
                const modal = document.getElementById('editorModal');
                if (modal) {
                    modal.classList.remove('active');
                }
            });
        }
        
        // カメラエディターモーダルのドラッグ機能を設定
        this.setupModalDragging();
        
        // モーダル背景クリックで閉じる
        const editorModal = document.getElementById('editorModal');
        if (editorModal) {
            editorModal.addEventListener('click', (e) => {
                if (e.target === editorModal) {
                    editorModal.classList.remove('active');
                }
            });
        }
        
        // ガレージモーダルを閉じる
        const closeGarageModal = document.getElementById('closeGarageModal');
        if (closeGarageModal) {
            closeGarageModal.addEventListener('click', () => {
                const modal = document.getElementById('garageModal');
                if (modal) {
                    modal.classList.remove('active');
                }
            });
        }
        
        // ガレージモーダル背景クリックで閉じる
        const garageModal = document.getElementById('garageModal');
        if (garageModal) {
            garageModal.addEventListener('click', (e) => {
                if (e.target === garageModal) {
                    garageModal.classList.remove('active');
                }
            });
        }
        
        // ガレージコントロール
        this.setupGarageControls();
        
        // カメラFOVコントロール
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
                this.garageSettings = {
                    scale: 0.5,
                    height: 0.6,
                    x: 1.3,
                    z: 1.0,
                    rotation: 0,
                    shadowFloorY: 0.03
                };
                
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
            console.log(`Switching to preset ${presetIndex + 1}`);
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
            console.log(`\n=== ${preset.name} - Progress: ${progress.toFixed(2)} ===`);
            console.log(`Camera position: x=${x.toFixed(3)}, y=${y.toFixed(3)}, z=${z.toFixed(3)}`);
            console.log(`Look mode: ${preset.cameraLookMode}, Pan: ${preset.cameraPan}°, Tilt: ${preset.cameraTilt}°`);
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
                    console.log(`LookAt target: x=${lookX.toFixed(3)}, y=${lookY.toFixed(3)}, z=${lookZ.toFixed(3)}`);
                    console.log(`Camera forward vector:`, this.camera.getWorldDirection(new THREE.Vector3()).toArray().map(v => v.toFixed(3)));
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
        console.log('\n=== Initializing UI ===');
        
        // デフォルトでモデルタブをアクティブに
        const modelTab = document.querySelector('.tab-btn[data-tab="models"]');
        const modelPanel = document.getElementById('models-panel');
        console.log('Model tab found:', modelTab);
        console.log('Model panel found:', modelPanel);
        
        if (modelTab && modelPanel) {
            modelTab.classList.add('active');
            modelPanel.classList.add('active');
            console.log('Set model tab and panel as active');
        }
        
        // すべてのタブパネルの状態を確認
        const allPanels = document.querySelectorAll('.tab-panel');
        console.log('\nAll panels status:');
        allPanels.forEach(panel => {
            console.log(`Panel ${panel.id}: classes = ${panel.classList.toString()}`);
        });
        
        // 初期カラーオプションをアクティブに
        const firstColorOption = document.querySelector('.color-option');
        if (firstColorOption) {
            firstColorOption.classList.add('active');
            console.log('Set first color option as active');
        }
        
        console.log('=== UI Initialization complete ===\n');
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        // プレビュー中またはムービー再生中でない場合のみコントロールを更新
        if (!this.cameraPreviewActive && !this.moviePlaying) {
            this.controls.update();
        }
        
        // 車の自動回転を削除
        
        this.renderer.render(this.scene, this.camera);
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
                console.log(`\n=== Camera Animation Debug t=${t.toFixed(2)} ===`);
                console.log(`Interpolated position: x=${x.toFixed(3)}, y=${y.toFixed(3)}, z=${z.toFixed(3)}`);
                console.log(`Start height: ${pathConfig.start.y}, End height: ${pathConfig.end.y}`);
                console.log(`Camera world position:`, this.camera.position.toArray().map(v => v.toFixed(3)));
                console.log(`Camera FOV: ${this.camera.fov}°`);
                console.log(`Camera near/far: ${this.camera.near}/${this.camera.far}`);
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
                console.log('\n=== Camera Animation Complete ===');
                console.log('Final camera position:', this.camera.position.toArray().map(v => v.toFixed(3)));
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
        console.log('\n========== PREVIEW PATH START ==========');
        console.log('Start height:', this.cameraStartHeight, 'End height:', this.cameraEndHeight);
        console.log('Start position:', this.startPoint);
        console.log('End position:', this.endPoint);
        console.log('Look mode:', this.cameraLookMode);
        console.log('========================================\n');
        
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
        
        console.log('Camera path configuration:', JSON.stringify(pathConfig, null, 2));
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
        
        alert(`プリセット${this.currentPresetSlot}に保存しました`);
        this.updateStatus(`プリセット${this.currentPresetSlot}に保存しました`);
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
        
        console.log('\n=== LOW HEIGHT TEST ===');
        console.log('Heights: 0.1m -> 0.3m');
        console.log('====================\n');
        
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
        
        console.log('\n=== HIGH HEIGHT TEST ===');
        console.log('Heights: 1.0m -> 5.0m');
        console.log('====================\n');
        
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

// モジュールスクリプトはデフォルトでdeferされるので、DOMが準備できている
console.log('\n========== MAIN.JS LOADED ==========');
console.log('Creating CarConfigurator instance...');
const configurator = new CarConfigurator();
console.log('CarConfigurator instance created');

// グローバルにアクセスできるように
window.configurator = configurator;