import * as THREE from "three"
import { Map } from "./Map"
import { Player } from "./Player"
import RAPIER from "@dimforge/rapier3d-compat"
import { FirstPersonControls, OrbitControls } from "three/examples/jsm/Addons.js"
import Stats from "three/examples/jsm/libs/stats.module.js"

//FPS Graoh
const stats = new Stats()
stats.showPanel(0)
document.body.appendChild(stats.dom)


const scene = new THREE.Scene()
scene.background = new THREE.Color(0x89cff0)

const camera = new THREE.PerspectiveCamera( 75, window.innerHeight / window.innerHeight, 0.1, 1000)
camera.aspect = window.innerWidth / window.innerHeight
camera.updateProjectionMatrix()

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" })
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.BasicShadowMap
/* Worst to Best Shadow Maps
* Basic
* PCF
* PCFSoft
* VSM
*/
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
document.body.appendChild(renderer.domElement)

await RAPIER.init()

var gameActive = false 

const gravity = {x: 0.0, y:-9.81, z:0.0}
const world = new RAPIER.World(gravity)
const map = new Map(scene, world)
let player = new Player(camera, scene, world )



//Game Loop
const clock = new THREE.Clock()

function gameLoop() {
    stats.begin()
    if (!document.fullscreenElement) {
        document.exitPointerLock();
        gameActive = false 
    }
    const delta = clock.getDelta()
    player.update(delta, gameActive)
    world.step()
    renderer.render( scene, camera)
    stats.end()
}

renderer.setAnimationLoop( gameLoop )

//Resize Window Adjustment
window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
})

//Start Game
document.addEventListener("keydown", (e) => {
    if (e.code == "KeyL") {
        document.body.requestFullscreen()
        document.body.requestPointerLock({ unadjustedMovement: true })
        gameActive = true 
    }
})