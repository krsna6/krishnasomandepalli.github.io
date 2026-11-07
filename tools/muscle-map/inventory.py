# Run inside Blender (blender -b Startup.blend --python inventory.py -- OUT_DIR).
# 1) Writes inventory.json: every collection (path, mesh objects, triangles) and every mesh object
#    (name, collection path, triangles, hidden flags) of the Z-Anatomy atlas.
# 2) Renders the muscular system in a clay grey, with biceps brachii in red, front and back, so the
#    model's quality can be judged against the reference before anything is built on it.
import bpy, json, sys, os, math, mathutils
out = sys.argv[sys.argv.index("--") + 1]
os.makedirs(out, exist_ok=True)

def coll_paths():
    paths = {}
    def walk(c, prefix):
        p = prefix + [c.name]
        for o in c.objects:
            paths.setdefault(o.name, "/".join(p))
        for ch in c.children:
            walk(ch, p)
    walk(bpy.context.scene.collection, [])
    return paths
paths = coll_paths()

objs = []
colls = {}
for o in bpy.data.objects:
    if o.type != "MESH":
        continue
    tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
    path = paths.get(o.name, "")
    objs.append({"name": o.name, "collection": path, "tris": tris, "hide_viewport": o.hide_viewport, "hide_render": o.hide_render,
                 "hidden": o.hide_get() if o.name in bpy.context.view_layer.objects else None,
                 "materials": [m.name for m in o.data.materials if m]})
    for i in range(1, len(path.split("/")) + 1):
        k = "/".join(path.split("/")[:i])
        c = colls.setdefault(k, {"objects": 0, "tris": 0})
        c["objects"] += 1; c["tris"] += tris
json.dump({"blender": bpy.app.version_string, "collections": colls, "objects": objs}, open(os.path.join(out, "inventory.json"), "w"), indent=1)
print("objects", len(objs), "collections", len(colls))

# ---- the render: muscles = meshes whose collection path mentions muscles, base left/right copies only
def is_muscle(o):
    p = paths.get(o.name, "").lower()
    n = o.name
    return o.type == "MESH" and ("muscul" in p or "muscle" in p) and (n.endswith(".l") or n.endswith(".r"))
musc = [o for o in bpy.data.objects if is_muscle(o)]
print("muscle meshes for render:", len(musc))
scene = bpy.context.scene
for o in scene.objects:
    o.hide_render = o not in musc
clay = bpy.data.materials.new("clay"); clay.use_nodes = True
b = clay.node_tree.nodes["Principled BSDF"]; b.inputs["Base Color"].default_value = (0.78, 0.78, 0.8, 1); b.inputs["Roughness"].default_value = 0.55
red = bpy.data.materials.new("hot"); red.use_nodes = True
r = red.node_tree.nodes["Principled BSDF"]; r.inputs["Base Color"].default_value = (0.9, 0.12, 0.05, 1); r.inputs["Roughness"].default_value = 0.45
for o in musc:
    hot = "biceps brachii" in o.name.lower()
    o.data.materials.clear(); o.data.materials.append(red if hot else clay)
# bounds
lo = mathutils.Vector((1e9,) * 3); hi = mathutils.Vector((-1e9,) * 3)
for o in musc:
    for c in o.bound_box:
        w = o.matrix_world @ mathutils.Vector(c)
        lo = mathutils.Vector(map(min, lo, w)); hi = mathutils.Vector(map(max, hi, w))
ctr = (lo + hi) / 2; size = hi - lo
print("bounds", tuple(lo), tuple(hi))
up = 2 if size[2] >= size[1] else 1   # the tall axis
scene.render.engine = "CYCLES"; scene.cycles.samples = 48; scene.cycles.device = "CPU"
scene.render.resolution_x = 900; scene.render.resolution_y = 1200
scene.world = scene.world or bpy.data.worlds.new("w"); scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.93, 0.94, 0.95, 1)
scene.world.node_tree.nodes["Background"].inputs[1].default_value = 0.9
cam_data = bpy.data.cameras.new("cam"); cam_data.type = "ORTHO"; cam_data.ortho_scale = max(size) * 1.08
cam = bpy.data.objects.new("cam", cam_data); scene.collection.objects.link(cam); scene.camera = cam
sun = bpy.data.lights.new("key", "SUN"); sun.energy = 3.0
sun_o = bpy.data.objects.new("key", sun); scene.collection.objects.link(sun_o)
for view, sign in (("front", -1), ("back", 1)):
    # assume the body faces -Y (Blender's front); the back render shows which way it faces
    d = max(size) * 3
    cam.location = ctr + mathutils.Vector((0, sign * d, 0))
    cam.rotation_euler = (math.radians(90), 0, 0 if sign < 0 else math.radians(180))
    sun_o.rotation_euler = (math.radians(60), math.radians(-20), math.radians(-30 if sign < 0 else 150))
    scene.render.filepath = os.path.join(out, f"render-{view}.png")
    bpy.ops.render.render(write_still=True)
print("done")
