(function() {
    // Basic settings
    const particleSrc = 'images/sakura-petal.png';
    const particleSize = { width: 0.7, height: 1 };
    const capacity = 500;
    const velocity = { x: 0.01, y: -0.02, z: 0.01 };

    window.addEventListener('DOMContentLoaded', () => {
        // Create canvas element
        const canvas = document.createElement('canvas');
        canvas.id = 'sakura-canvas';
        canvas.style.position = 'fixed';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.pointerEvents = 'none'; // Don't block interactions!
        canvas.style.zIndex = '-1';          // Place behind content
        document.body.prepend(canvas);

        initBabylonScene(canvas);
    });

    async function initBabylonScene(canvas) {
        // Initialize engine and scene
        const engine = new BABYLON.Engine(canvas, true, { antialias: true });
        const scene = new BABYLON.Scene(engine);
        scene.clearColor = new BABYLON.Color4(0, 0, 0, 0); // Transparent background

        // Camera
        const camera = new BABYLON.ArcRotateCamera(
            'camera',
            Math.PI / 2,
            Math.PI / 2,
            50, // camera.radius in Vue code
            new BABYLON.Vector3(0, 0, 0),
            scene
        );

        // Light
        const light = new BABYLON.HemisphericLight('light', new BABYLON.Vector3(0.5, 1, 0), scene);
        light.intensity = 1;
        light.diffuse = new BABYLON.Color3(1, 1, 1);
        light.groundColor = new BABYLON.Color3(1, 1, 1);

        // Rendering Pipeline
        const pipeline = new BABYLON.DefaultRenderingPipeline(
            'defaultPipeline',
            false,
            scene,
            [camera]
        );
        pipeline.depthOfFieldEnabled = true;
        pipeline.depthOfField.focusDistance = 37000;
        pipeline.depthOfField.focalLength = 5000;
        pipeline.depthOfField.fStop = 8;
        // High = 2 in Babylon Space
        pipeline.depthOfFieldBlurLevel = 2; // BABYLON.DepthOfFieldEffectBlurLevel.High
        pipeline.bloomEnabled = true;

        // Initialize particles/mesh
        initParticles(scene, camera);

        // Render loop
        engine.runRenderLoop(() => {
            scene.render();
        });

        // Handle window resize
        window.addEventListener('resize', () => {
            engine.resize();
        });
    }

    function initParticles(scene, camera) {
        const box = BABYLON.MeshBuilder.CreateBox('box', {
            width: particleSize.width,
            height: particleSize.height,
            depth: 0.001
        }, scene);

        let index = 0;
        const size = camera.radius * 1.5;
        const matricesData = new Float32Array(16 * capacity);

        for (let i = 0; i < capacity; i++) {
            const translationMatrix = BABYLON.Matrix.Translation(
                Math.random() * size - size / 2,
                Math.random() * size - size / 2,
                Math.random() * size - size / 2
            );
            translationMatrix.copyToArray(matricesData, index * 16);
            index++;
        }

        box.thinInstanceSetBuffer('matrix', matricesData, 16);

        const material = new BABYLON.StandardMaterial('material', scene);
        material.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);

        const dynamicTexture = new BABYLON.DynamicTexture('dynamicTexture', {
            width: 124,
            height: 180
        }, scene);
        dynamicTexture.hasAlpha = true;

        const img = new Image();
        img.onload = () => {
            const ctx = dynamicTexture.getContext();
            ctx.drawImage(img, 0, 0, 124, 180);
            dynamicTexture.update();
        };
        img.src = particleSrc;

        material.diffuseTexture = dynamicTexture;
        box.material = material;

        // Animation logic
        scene.registerBeforeRender(() => {
            const time = performance.now() * 0.001;
            for (let i = 0; i < capacity; i++) {
                const offset = i * 16;
                
                const originalX = matricesData[offset + 12] || 0;
                const originalY = matricesData[offset + 13] || 0;
                const originalZ = matricesData[offset + 14] || 0;

                let y = originalY + velocity.y;
                let x = originalX + 0.005 * Math.sin(time + i * 0.01) + velocity.x;
                let z = originalZ + 0.005 * Math.cos(time + i * 0.01) + velocity.z;

                if (y < -size / 2) {
                    y = size / 2;
                    x = Math.random() * size - size / 2;
                    z = Math.random() * size - size / 2;
                }

                const angle = time * 0.5 + i * 0.1;
                const rotationMatrix = BABYLON.Matrix.RotationYawPitchRoll(
                    angle,
                    angle,
                    angle
                );

                const translationMatrix = BABYLON.Matrix.Translation(x, y, z);
                const finalMatrix = rotationMatrix.multiply(translationMatrix);

                finalMatrix.copyToArray(matricesData, offset);
            }

            box.thinInstanceSetBuffer('matrix', matricesData, 16);
        });
    }
})();
