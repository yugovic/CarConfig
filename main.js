import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

class CarConfigurator {
    constructor() {
        this.container = document.getElementById('canvas-container');
        this.loadingScreen = document.getElementById('loading');
        
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
            'DaimlerV8': '/Assets/DaimlerV8.glb',
            'JaguarXJ8': '/Assets/JaguarXJ8.glb',
            'JaguarXJR': '/Assets/JaguarXJR.glb',
            'JaguarSuperV8': '/Assets/JaguarSuperV8.glb',
            'JaguarXJSovereign': '/Assets/JaguarXJSovereign.glb',
            'JaguarXJSports': '/Assets/JaguarXJSports.glb'
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
        this.setupEventListeners();
        this.animate();
    }
    
    setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a0a);
        this.scene.fog = new THREE.Fog(0x0a0a0a, 10, 50);
    }
    
    setupCamera() {
        const aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 100);
        // フロントビューを初期位置に設定
        this.camera.position.set(-3, 1.2, -3);
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
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 10, 5);
        directionalLight.castShadow = true;
        directionalLight.shadow.camera.near = 0.1;
        directionalLight.shadow.camera.far = 50;
        directionalLight.shadow.camera.left = -10;
        directionalLight.shadow.camera.right = 10;
        directionalLight.shadow.camera.top = 10;
        directionalLight.shadow.camera.bottom = -10;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        this.scene.add(directionalLight);
        
        const spotLight1 = new THREE.SpotLight(0xffffff, 0.5);
        spotLight1.position.set(-5, 5, 0);
        spotLight1.angle = Math.PI / 4;
        spotLight1.penumbra = 0.5;
        spotLight1.castShadow = true;
        this.scene.add(spotLight1);
        
        const spotLight2 = new THREE.SpotLight(0xffffff, 0.5);
        spotLight2.position.set(5, 5, 0);
        spotLight2.angle = Math.PI / 4;
        spotLight2.penumbra = 0.5;
        spotLight2.castShadow = true;
        this.scene.add(spotLight2);
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
        
        // コンクリート調の床
        const floorGeometry = new THREE.PlaneGeometry(20, 20);
        const floorMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x4a4a4a,
            roughness: 0.95,
            metalness: 0.05,
            normalScale: new THREE.Vector2(0.5, 0.5)
        });
        
        // コンクリートのテクスチャ感を出すため、頂点カラーでランダムな変化を追加
        const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
        floorMesh.rotation.x = -Math.PI / 2;
        floorMesh.receiveShadow = true;
        
        // グリッドラインを追加（駐車場のライン風）
        const gridHelper = new THREE.GridHelper(20, 10, 0x555555, 0x333333);
        gridHelper.position.y = 0.01;
        
        this.scene.add(floorMesh);
        this.scene.add(gridHelper);
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
                this.carModel.position.set(0, 0, 0);
                
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
            this.carModel.position.set(0, 0, 0);
            
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
        // アコーディオン機能
        document.querySelectorAll('.control-header').forEach(header => {
            header.addEventListener('click', () => {
                const controlGroup = header.parentElement;
                controlGroup.classList.toggle('collapsed');
            });
        });
        
        // 車種選択ボタン
        document.querySelectorAll('.car-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.car-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.changeCar(btn.dataset.car);
            });
        });
        
        // カラーピッカー
        const colorPicker = document.getElementById('bodyColorPicker');
        if (colorPicker) {
            colorPicker.addEventListener('input', (e) => {
                this.changePaintColor(e.target.value);
            });
        }
        
        // プリセットカラーボタン
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const color = btn.dataset.color;
                if (colorPicker) {
                    colorPicker.value = color;
                }
                this.changePaintColor(color);
            });
        });
        
        document.querySelectorAll('.camera-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.setCameraView(btn.dataset.view);
            });
        });
        
        window.addEventListener('resize', () => {
            const width = this.container.clientWidth;
            const height = this.container.clientHeight;
            
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
            
            this.renderer.setSize(width, height);
        });
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        this.controls.update();
        
        if (this.carModel && !this.controls.enabled) {
            this.carModel.rotation.y += 0.001;
        }
        
        this.renderer.render(this.scene, this.camera);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new CarConfigurator();
});