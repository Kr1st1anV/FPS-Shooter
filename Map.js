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
        sun.castShadow = true
        sun.shadow.mapSize.width = 512
        sun.shadow.mapSize.height = 512
        sun.shadow.camera.near = 1.0
        sun.shadow.camera.far = 500.0
        sun.shadow.camera.left = 50
        sun.shadow.camera.right = -50
        sun.shadow.camera.top = 50
        sun.shadow.camera.bottom = -50
        this.scene.add(sun)

        const loader = new GLTFLoader()

        const dracoLoader = new DRACOLoader()
        dracoLoader.setDecoderPath('/examples/jsm/libs/draco')
        loader.setDRACOLoader( dracoLoader )
        const object1 = await loader.loadAsync( "/map-props/house2.glb")
        const object2 = await loader.loadAsync( "/map-props/house2.glb")
        const object3 = await loader.loadAsync( "/map-props/house2.glb")
        const object4 = await loader.loadAsync( "/map-props/house2.glb")
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
        const grass = new THREE.Mesh(
            new THREE.BoxGeometry(100,0.2,100),
            new THREE.MeshStandardMaterial({color: 0x00bb00}))

        this.scene.add(grass)
    }

    update() {

    }
}