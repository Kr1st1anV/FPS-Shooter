import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

async function initGame() {
    await RAPIER.init();
    const gravity = { x: 0.0, y: -9.81, z: 0.0 };
    const world = new RAPIER.World(gravity);

    // Scene Setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 10);
    
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(5, 10, 5);
    scene.add(light, new THREE.AmbientLight(0xffffff, 0.5));

    // Ground
    let groundBodyDesc = RAPIER.RigidBodyDesc.fixed();
    let groundBody = world.createRigidBody(groundBodyDesc);
    let groundColliderDesc = RAPIER.ColliderDesc.cuboid(5, 0.05, 5);
    world.createCollider(groundColliderDesc, groundBody);
    
    const groundMesh = new THREE.Mesh(
        new THREE.BoxGeometry(10, 0.1, 10),
        new THREE.MeshStandardMaterial({ color: 0x444444 })
    );
    scene.add(groundMesh);

    // Character
    const radius = 0.5;
    const height = 1.0;
    let charBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 5, 0);
    let charBody = world.createRigidBody(charBodyDesc);
    
    // FIX: Store the collider in a variable
    let charColliderDesc = RAPIER.ColliderDesc.capsule(height / 2, radius);
    let charCollider = world.createCollider(charColliderDesc, charBody);

    let controller = world.createCharacterController(0.01);
    controller.enableSnapToGround(0.5);

    const charMesh = new THREE.Mesh(
        new THREE.CapsuleGeometry(radius, height, 4, 8),
        new THREE.MeshStandardMaterial({ color: 0x00ff00 })
    );
    scene.add(charMesh);

    // Input Handling
    const keys = { w: false, a: false, s: false, d: false, space: false };
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space') keys.space = true;
        else keys[e.key.toLowerCase()] = true;
    });
    document.addEventListener('keyup', (e) => {
        if (e.code === 'Space') keys.space = false;
        else keys[e.key.toLowerCase()] = false;
    });

    let verticalVelocity = 0;
    const jumpStrength = 0.15;
    const gravityConstant = -0.005;

    function animate() {
        requestAnimationFrame(animate);

        const movement = new THREE.Vector3(0, 0, 0);
        const speed = 0.05;

        if (keys.w) movement.z -= speed;
        if (keys.s) movement.z += speed;
        if (keys.a) movement.x -= speed;
        if (keys.d) movement.x += speed;

        // Jump & Gravity Logic
        const isGrounded = controller.computedGrounded();
        
        if (isGrounded && keys.space) {
            verticalVelocity = jumpStrength;
        } else if (!isGrounded) {
            verticalVelocity += gravityConstant;
        } else {
            verticalVelocity = Math.max(0, verticalVelocity); 
        }

        movement.y = verticalVelocity;

        // Apply Collision
        controller.computeColliderMovement(charCollider, movement);
        const corrected = controller.computedMovement();

        const currentPos = charBody.translation();
        charBody.setNextKinematicTranslation({
            x: currentPos.x + corrected.x,
            y: currentPos.y + corrected.y,
            z: currentPos.z + corrected.z
        });

        // Sync and Render
        const finalPos = charBody.translation();
        charMesh.position.set(finalPos.x, finalPos.y, finalPos.z);
        
        camera.lookAt(charMesh.position);
        world.step();
        camera.position.set(charMesh.position.x + 1, charMesh.position.y + 5, charMesh.position.z)
        renderer.render(scene, camera);
    }

    animate();
}

initGame();