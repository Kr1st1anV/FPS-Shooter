import * as THREE from "three";
import RAPIER from '@dimforge/rapier3d-compat';
import gsap from "gsap";

export class WeaponSystem {
    constructor(scene, world, camera, charBody) {
        this.scene = scene;
        this.world = world;
        this.camera = camera;
        this.charBody = charBody;

        this.fireRate = 150;
        this.lastShotTime = 0;
        this.shotCount = 0;
        this.ammoLeft = 30
        this.fullAmmo = 30
        this.isReloading = false;

        // Assets
        const flashCanvas = document.getElementById('muzzle-flash-canvas');
        this.muzzleFlashTexture = new THREE.CanvasTexture(flashCanvas);
        this.muzzleLight = new THREE.PointLight(0xffaa00, 0.1, 0);
        this.muzzleLight.visible = false;
        this.scene.add(this.muzzleLight);

        // Fixed Recoil Pattern (The path the gun kicks)
        this.recoilPattern = [
            { x: 0.00, y: 0.00 }, { x: 0.00, y: 0.01 },
            { x: 0.00, y: 0.02 }, { x: 0.01, y: 0.03 },
            { x: -0.01, y: 0.04 }
        ];
    }

    updateUI() {
        const currentAmmoEl = document.getElementById('current-ammo');
        const totalAmmoEl = document.getElementById('total-ammo');
        const ammoBar = document.getElementById('ammo-bar');
        const reloadPrompt = document.getElementById('reload-prompt');

        if (!currentAmmoEl || !ammoBar) return;

        // 1. Update Text
        currentAmmoEl.innerText = this.ammoLeft;
        totalAmmoEl.innerText = this.fullAmmo;

        // 2. Update Progress Bar
        const circumference = 2 * Math.PI * 35; // 220
        const offset = circumference - (this.ammoLeft / this.fullAmmo) * circumference;
        ammoBar.style.strokeDashoffset = offset;

        // 3. Visual Feedback for Low Ammo
        if (this.ammoLeft <= this.fullAmmo * 0.25) {
            ammoBar.style.stroke = "#ff3366"; // Turn red when low
            reloadPrompt.style.opacity = "1";
        } else {
            ammoBar.style.stroke = "#00ffcc"; // Neon Cyan
            reloadPrompt.style.opacity = "0";
        }

        // 4. Punch Animation on shoot (using GSAP)
        gsap.fromTo("#current-ammo", 
            { scale: 1.2, color: "#00ffcc" }, 
            { scale: 1, color: "white", duration: 0.1 }
        );
    }

    shoot(gun, charBody, onRecoil, currentVelocity) {
        if (!gun || this.isReloading) return;
        if (this.ammoLeft <= 0) return
        const now = performance.now();
        if (now - this.lastShotTime < this.fireRate) return;

        // Reset shot count if player hasn't fired in a while
        if (now - this.lastShotTime > 250) this.shotCount = 0;
        this.lastShotTime = now;

        const speed = new THREE.Vector3(currentVelocity.x, 0, currentVelocity.z).length();
    
        // Define how much movement affects accuracy
        const moveErrorThreshold = 0.1; // Speed below this is considered "standing still"
        const moveErrorIntensity = 0.02; // How much the circle expands per unit of speed

        let movementBloom = 0;
        if (speed > moveErrorThreshold) {
            movementBloom = speed * moveErrorIntensity;
        }

        let pattern;
        let verticalKick;

        // 1. Determine Base Recoil Pattern
        if (this.shotCount < this.recoilPattern.length) {
            pattern = this.recoilPattern[this.shotCount];
            verticalKick = 0.004;
        } else {
            const bulletPatternWidth = 0.040;
            verticalKick = 0.0;
            pattern = { x: Math.cos(this.shotCount * 0.8) * bulletPatternWidth, y: 0.02 };
        }
        this.shotCount++;
        this.ammoLeft--;
        this.updateUI();

        // 2. Setup Camera Vectors
        const camPos = new THREE.Vector3();
        const camDir = new THREE.Vector3();
        this.camera.getWorldPosition(camPos);
        this.camera.getWorldDirection(camDir);

        const right = new THREE.Vector3().crossVectors(camDir, new THREE.Vector3(0, 1, 0)).normalize();
        const up = new THREE.Vector3().crossVectors(right, camDir).normalize();

        // 3. Distance scaling for recoil intensity
        const tempRay = new RAPIER.Ray(camPos, camDir);
        const distanceHit = this.world.castRay(tempRay, 1000, true, undefined, undefined, undefined, charBody);
        const dist = distanceHit ? distanceHit.timeOfImpact : 100;
        let distanceFactor = THREE.MathUtils.clamp(5 / dist, 0, 1.8);
        const recoilIntensity = Math.max(0.1, 0.5 * distanceFactor);

        const baseBloom = 0.001; // Natural inaccuracy even when standing
        const totalSpreadRadius = (this.shotCount * baseBloom) + movementBloom;

        // Circular Randomization (Uniform Distribution)
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.sqrt(Math.random()) * totalSpreadRadius * 0.5; 
        
        const randomX = Math.cos(angle) * radius;
        const randomY = Math.sin(angle) * radius;

        // 5. Combine Pattern + Random Spread
        const sprayDir = camDir.clone()
            .add(right.multiplyScalar((pattern.x * recoilIntensity) + randomX))
            .add(up.multiplyScalar((pattern.y * recoilIntensity) + randomY))
            .normalize();

        // 6. Execution (Raycast)
        const bulletRay = new RAPIER.Ray(camPos, sprayDir);
        const hit = this.world.castRayAndGetNormal(bulletRay, 1000, true, undefined, undefined, undefined, charBody);
        const targetPoint = new THREE.Vector3();

        if (hit && !isNaN(hit.timeOfImpact)) {
            targetPoint.copy(camPos).add(sprayDir.clone().multiplyScalar(hit.timeOfImpact));
            this.createImpactDot(targetPoint, new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z));

            this.showHitmarker()
        } else {
            targetPoint.copy(camPos).add(sprayDir.clone().multiplyScalar(100));
        }

        // Trigger visual recoil callback
        const hKick = pattern.x * recoilIntensity / 2;
        const vKick = verticalKick * 2.5 * recoilIntensity;
        onRecoil(hKick, vKick);

        // Visuals
        const muzzlePos = this.getMuzzleWorldPosition(gun);
        this.createMuzzleFlash(gun);
        this.createBulletTracer(muzzlePos, targetPoint);
    }

    showHitmarker() {
        const hm = document.getElementById('hitmarker-container');
        // Reset any ongoing animation
        gsap.killTweensOf(hm);
        
        // Snap to visible and slightly larger, then fade/shrink
        gsap.fromTo(hm, 
            { opacity: 1, scale: 1.2 }, 
            { opacity: 0, scale: 0.8, duration: 0.15, ease: "power2.out" }
        );
    }

    reload(gun, restingPos, camera) {
        if (this.isReloading || !gun) return;
        this.isReloading = true;
        this.shotCount = 0;

        const tl = gsap.timeline({
            onComplete: () => { this.isReloading = false; }
        });

        tl.to(gun.position, { 
            x: restingPos.x + 0.05, 
            y: restingPos.y - 0.5, 
            z: restingPos.z + 0.1, 
            duration: 0.4, 
            ease: "power2.inOut" 
        });
        tl.to(gun.rotation, { x: 0.4, z: 0.6, duration: 0.4 }, "-=0.4");

        tl.to(gun.position, { 
            y: restingPos.y - 0.45, 
            duration: 0.1, 
            onStart: () => {
                gsap.to(camera.position, { y: "-=0.02", duration: 0.05, yoyo: true, repeat: 1 });
            }
        });

        tl.to(gun.position, { z: restingPos.z + 0.15, duration: 0.15 });
        tl.to(gun.position, { z: restingPos.z, duration: 0.1 });

        tl.to(gun.position, { 
            x: restingPos.x, 
            y: restingPos.y, 
            z: restingPos.z, 
            duration: 0.3, 
            ease: "back.out(1.2)" 
        });
        tl.to(gun.rotation, { x: 0, z: 0, duration: 0.3 }, "-=0.3");
        this.ammoLeft = this.fullAmmo
        this.updateUI();
    }

    createMuzzleFlash(gun) {
        const muzzlePos = this.getMuzzleWorldPosition(gun);
        this.muzzleLight.position.copy(muzzlePos);
        this.muzzleLight.visible = true;

        const spriteMaterial = new THREE.SpriteMaterial({ 
            map: this.muzzleFlashTexture, 
            blending: THREE.AdditiveBlending,
            transparent: true
        });
        const sprite = new THREE.Sprite(spriteMaterial);
        
        gun.add(sprite); 

        sprite.position.set(0, 0.08, -0.44); 
        sprite.scale.set(0.4, 0.4, 0.4);
        
        sprite.material.rotation = Math.random() * Math.PI;

        setTimeout(() => { 
            this.muzzleLight.visible = false; 
            gun.remove(sprite);
            spriteMaterial.dispose();
        }, 45);
    }

    getMuzzleWorldPosition(gun) {
        const muzzleOffset = new THREE.Vector3(0, 0.08, -0.44);
        gun.updateMatrixWorld(true);
        return muzzleOffset.applyMatrix4(gun.matrixWorld);
    }

    createImpactDot(point, normal) {
        const geometry = new THREE.CircleGeometry(0.04, 8);
        const material = new THREE.MeshBasicMaterial({ 
            color: 0x000000, 
            transparent: true, 
            opacity: 0.9 
        });
        const dot = new THREE.Mesh(geometry, material);

        dot.position.copy(point).add(normal.clone().multiplyScalar(0.01));
        dot.lookAt(point.clone().add(normal));
        this.scene.add(dot);

        gsap.to(material, {
            opacity: 0,
            delay: 8,
            duration: 1.5,
            onComplete: () => {
                this.scene.remove(dot);
                geometry.dispose();
                material.dispose();
            }
        });
    }

    createBulletTracer(start, end) {
        const travelDistance = start.distanceTo(end);
        if (travelDistance < 0.1) return;

        const tracerLength = 3.0; 
        const geometry = new THREE.CylinderGeometry(0.005, 0.02, tracerLength, 8);
        const material = new THREE.MeshStandardMaterial({ 
            color: 0xffffff,
            emissive: 0xffcc00,
            emissiveIntensity: 5,
            transparent: true,
            blending: THREE.AdditiveBlending 
        });

        const tracer = new THREE.Mesh(geometry, material);
        tracer.position.copy(start);
        const direction = new THREE.Vector3().subVectors(end, start).normalize();
        const axis = new THREE.Vector3(0, 1, 0); 
        tracer.quaternion.setFromUnitVectors(axis, direction);
        tracer.translateY(tracerLength / 2);
        this.scene.add(tracer);

        const bulletSpeed = 200; 
        let distanceCovered = 0;
        let lastTime = performance.now();

        const animate = (currentTime) => {
            const deltaTime = (currentTime - lastTime) / 1000;
            lastTime = currentTime;
            distanceCovered += bulletSpeed * deltaTime;
            const progress = distanceCovered / travelDistance;

            if (progress >= 1.0) {
                this.scene.remove(tracer);
                geometry.dispose();
                material.dispose();
                return; 
            }

            const currentPos = new THREE.Vector3().lerpVectors(start, end, progress);
            tracer.position.copy(currentPos);
            if (progress > 0.8) material.opacity = 1 - ((progress - 0.8) / 0.2);
            requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }
}