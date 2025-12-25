import * as THREE from "three"
import RAPIER from '@dimforge/rapier3d-compat';
import { DRACOLoader, GLTFLoader } from "three/examples/jsm/Addons.js";

export class Map  {
    constructor(scene, world) {
        this.scene = scene
        this.world = world

        this.init()
    }

    async init() {
        await RAPIER.init()

        //Lighting
        const sun = new THREE.DirectionalLight(0xffffff, 2)
        sun.position.set(0,150,0)
        sun.target.position.set(0,0,0)
        sun.castShadow = false
        // sun.shadow.mapSize.width = 512
        // sun.shadow.mapSize.height = 512
        // sun.shadow.camera.near = 1.0
        // sun.shadow.camera.far = 500.0
        // sun.shadow.camera.left = 50
        // sun.shadow.camera.right = -50
        // sun.shadow.camera.top = 50
        // sun.shadow.camera.bottom = -50
        this.scene.add(sun)

        const loader = new GLTFLoader()

        const dracoLoader = new DRACOLoader()
        dracoLoader.setDecoderPath('/examples/jsm/libs/draco')
        loader.setDRACOLoader( dracoLoader )
        const object1 = await loader.loadAsync( "/map_props/house2.glb")
        const object2 = await loader.loadAsync( "/map_props/house2.glb")
        const object3 = await loader.loadAsync( "/map_props/house2.glb")
        const object4 = await loader.loadAsync( "/map_props/house2.glb")
        object1.scene.traverse((child) => {
            if (child.isMesh) {
                child.material.color.set(0xff0000)
            }
        })
        object2.scene.traverse((child) => {
            if (child.isMesh) {
                child.material.color.set(0x00ff00)
            }
        })
        object3.scene.traverse((child) => {
            if (child.isMesh) {
                child.material.color.set(0x0000ff)
            }
        })
        object4.scene.traverse((child) => {
            if (child.isMesh) {
                child.material.color.set(0xffffff)
            }
        })
        object1.scene.position.set(30,0.5,0)
        object1.scene.rotation.y = -Math.PI/2
        object1.scene.color = new THREE.Color(0xffffff)
        object2.scene.rotation.y = Math.PI
        object2.scene.position.set(0,0.5,30)
        object2.scene.color = new THREE.Color(0xffffff)
        object3.scene.position.set(-30,0.5,0)
        object3.scene.rotation.y = Math.PI/2
        object3.scene.color = new THREE.Color(0xffffff)
        object4.scene.position.set(0,0.5,-30)
        object3.scene.color = new THREE.Color(0xffffff)
        this.scene.add(object1.scene, object2.scene, object3.scene, object4.scene)


        //Ground Collision
        let groundBodyDesc = RAPIER.RigidBodyDesc.fixed()
        let groundBody = this.world.createRigidBody(groundBodyDesc)
        let groundColliderDesc = RAPIER.ColliderDesc.cuboid(50,0.1,50)
        this.world.createCollider(groundColliderDesc, groundBody)

        //Floor Visual
        const ground = new THREE.Mesh(
            new THREE.BoxGeometry(100,0.2,100),
            new THREE.MeshStandardMaterial({color: 0x00bb00}))
        //Ramp Visual
        const ramp = new THREE.Mesh(
            new THREE.BoxGeometry(5,0.4,8),
            new THREE.MeshStandardMaterial({color: 0xff8f63}))
        ramp.rotation.x = Math.PI / 5.5
        ramp.position.set(0, 4 * Math.sin(Math.PI / 5.5) , 0)
        //Ramp Collider
        // Get world-space position, rotation, and scale
        ramp.updateMatrixWorld(true)
        const worldPos = new THREE.Vector3();
        const worldQuat = new THREE.Quaternion();
        const worldScale = new THREE.Vector3();
        ramp.matrixWorld.decompose(worldPos, worldQuat, worldScale);

        // 1. Create Body at the mesh's position and rotation
        const bodyDesc = RAPIER.RigidBodyDesc.fixed()
            .setTranslation(worldPos.x, worldPos.y, worldPos.z)
            .setRotation(worldQuat); // Rapier accepts Quaternions directly

        const body = this.world.createRigidBody(bodyDesc);

        // 2. Handle Scaling manually in the Collider
        // If it's a cuboid (box) of size 1,1,1:
        const scaledWidth = 5 * worldScale.x;
        const scaledHeight = 0.4 * worldScale.y;
        const scaledDepth = 8 * worldScale.z;

        const colliderDesc = RAPIER.ColliderDesc.cuboid(scaledWidth/2, scaledHeight/2, scaledDepth/2);
        this.world.createCollider(colliderDesc, body);
        this.scene.add(ground,ramp)
    }

    update() {

    }
}