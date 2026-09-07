# Room dressing for entry 001's hut: props that primitives do badly.
# Same frame rules as enigma-parts.py (author in three's frame via B(), origin at
# the base centre so each can be dropped onto a desk or the floor).
#   telephone  — Bakelite desk telephone (GPO 300-style): body, cradle, handset, dial
#   typewriter — a Typex-style machine for the second desk: body, key rows, carriage
#   stove      — a pot-belly stove with flue pipe for the back corner
#   coat       — a greatcoat on a wall hook (hook at origin, coat hangs down)
import argparse, math, sys
import bpy

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser(); ap.add_argument("--out", required=True); args = ap.parse_args(argv)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
if sc.world is None: sc.world = bpy.data.worlds.new("World")

def B(x, y, z): return (x, -z, y)
def S(w, h, d): return (w, d, h)
def box(size, at, bevel=0.0, segs=2):
    bpy.ops.mesh.primitive_cube_add(size=1, location=B(*at)); o = bpy.context.active_object
    o.scale = S(*size); bpy.ops.object.transform_apply(scale=True)
    if bevel > 0:
        m = o.modifiers.new("b", "BEVEL"); m.width = bevel; m.segments = segs; m.limit_method = "ANGLE"
    return o
def cyl(r, depth, at, axis="Y", verts=24, r2=None, bevel=0.0):
    rot = (0, 0, 0) if axis == "Y" else (0, math.pi / 2, 0) if axis == "X" else (math.pi / 2, 0, 0)
    if r2 is None: bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=B(*at), rotation=rot)
    else: bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=depth, location=B(*at), rotation=rot)
    o = bpy.context.active_object
    if bevel > 0:
        m = o.modifiers.new("b", "BEVEL"); m.width = bevel; m.segments = 2; m.limit_method = "ANGLE"
    return o
def sphere(r, at, seg=20):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=B(*at), segments=seg, ring_count=seg // 2); return bpy.context.active_object
def torus(major, minor, at, axis="Y", segs=32, msegs=10, rot_extra=(0, 0, 0)):
    rot = (0, 0, 0) if axis == "Y" else (0, math.pi / 2, 0) if axis == "X" else (math.pi / 2, 0, 0)
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=segs, minor_segments=msegs, location=B(*at), rotation=rot)
    return bpy.context.active_object
def finish(o):
    bpy.context.view_layer.objects.active = o
    for ob in bpy.data.objects: ob.select_set(False)
    o.select_set(True)
    for m in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    o.select_set(False); return o
def join(objs, name):
    objs = [finish(o) for o in objs]
    for ob in bpy.data.objects: ob.select_set(False)
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1: bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active; o.name = name; o.data.name = name
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.01); bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35))
    o.select_set(False); return o

parts = []

# ── telephone (~1.1 wide ≈ 12 cm... scale: 1 unit ≈ 11 cm; a GPO 332 is ~22 cm wide → 2.0 units) ──
tel = [box((2.0, 0.55, 1.7), (0, 0.275, 0), bevel=0.12, segs=4)]                  # base body
tel.append(box((1.6, 0.55, 1.2), (0, 0.8, -0.1), bevel=0.2, segs=4))               # sloping upper body
for sx in (-0.55, 0.55):                                                           # cradle prongs
    tel.append(box((0.16, 0.35, 0.5), (sx, 1.2, -0.1), bevel=0.05))
handset = [cyl(0.19, 2.0, (0, 1.42, -0.1), axis="X", verts=18, bevel=0.03)]        # handset bar
for sx in (-1.0, 1.0):
    handset.append(cyl(0.34, 0.36, (sx, 1.42, -0.1), axis="Y", verts=20, r2=0.28))  # ear/mouth pieces
tel += handset
tel.append(cyl(0.42, 0.06, (0, 0.62, 0.62), axis="Z", verts=32))                    # dial plate
for i in range(10):                                                                # finger holes
    a = -math.pi * 0.15 - i * (2 * math.pi / 12)
    tel.append(cyl(0.055, 0.04, (math.cos(a) * 0.3, 0.62 + math.sin(a) * 0.3, 0.66), axis="Z", verts=10))
tel.append(box((0.12, 0.05, 0.4), (0.52, 0.62, 0.72)))                             # finger stop
tel.append(torus(0.06, 0.02, (-1.1, 0.25, 0.8), axis="Y"))                         # cord grommet
parts.append(join(tel, "telephone"))

# ── typewriter (Typex-ish: ~38 cm wide → 3.5 units) ────────────────────────
tw = [box((3.5, 0.9, 2.6), (0, 0.45, 0), bevel=0.1, segs=3)]                       # body
tw.append(box((3.7, 0.25, 0.7), (0, 1.05, -0.9), bevel=0.06))                      # carriage rail
tw.append(cyl(0.3, 3.9, (0, 1.35, -0.95), axis="X", verts=20))                     # platen
for sx in (-2.0, 2.0):
    tw.append(cyl(0.34, 0.12, (sx, 1.35, -0.95), axis="X", verts=16))              # platen knobs
tw.append(box((2.4, 0.12, 0.5), (0, 1.02, -0.35), bevel=0.02))                     # type basket cover
rows = [(0.55, 1.3), (0.85, 0.98), (1.15, 0.66)]                                   # key rows (z, y)
for ri, (rz, ry) in enumerate(rows):
    n = 10 - (ri % 2)
    for i in range(n):
        x = (i - (n - 1) / 2) * 0.32
        tw.append(cyl(0.1, 0.06, (x, ry, rz), axis="Y", verts=14))                 # key cap
        tw.append(cyl(0.03, 0.4, (x, ry - 0.22, rz - 0.08), axis="Y", verts=6))    # key lever
tw.append(box((2.2, 0.08, 0.3), (0, 0.3, 1.45), bevel=0.02))                       # space bar
parts.append(join(tw, "typewriter"))

# ── stove (pot-belly, ~60 cm tall → 5.5 units; flue up 12 units) ───────────
st = [cyl(1.1, 0.4, (0, 0.2, 0), axis="Y", verts=28, r2=1.0)]                      # base ring
st.append(sphere(1.4, (0, 2.2, 0), seg=28))                                        # belly
st.append(cyl(0.9, 1.4, (0, 3.9, 0), axis="Y", verts=24, r2=0.75))                 # neck
st.append(cyl(0.95, 0.12, (0, 4.65, 0), axis="Y", verts=24))                       # top plate
st.append(cyl(0.32, 7.4, (0, 8.4, 0), axis="Y", verts=16))                          # flue
st.append(cyl(0.34, 0.9, (0, 12.0, -0.1), axis="Z", verts=16))                     # elbow stub into the wall
st.append(box((0.9, 0.7, 0.1), (0, 1.9, 1.38), bevel=0.02))                        # firebox door
st.append(cyl(0.05, 0.4, (0.32, 1.9, 1.48), axis="Y", verts=8))                    # door handle
for i in range(3):                                                                 # feet
    a = i * 2 * math.pi / 3
    st.append(box((0.35, 0.5, 0.35), (math.cos(a) * 0.95, 0.15, math.sin(a) * 0.95), bevel=0.03))
parts.append(join(st, "stove"))

# ── greatcoat on a hook (hook at origin; coat hangs to −8.5) ───────────────
co = [cyl(0.08, 0.5, (0, 0, 0.2), axis="Z", verts=10), sphere(0.13, (0, 0, 0.45), seg=12)]   # hook
co.append(cyl(0.9, 1.2, (0, -0.9, 0.55), axis="Y", verts=24, r2=1.9))              # shoulders (cone)
co.append(cyl(1.9, 6.8, (0, -4.9, 0.55), axis="Y", verts=24, r2=1.7))              # body
co.append(box((3.0, 0.5, 0.6), (0, -0.55, 0.9), bevel=0.15, segs=3))               # collar
co.append(cyl(0.5, 5.0, (-1.75, -3.6, 0.7), axis="Y", verts=12, r2=0.45))          # sleeve
parts.append(join(co, "coat"))

for o in bpy.data.objects: o.select_set(o in parts)
bpy.ops.export_scene.gltf(filepath=args.out, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
                          export_cameras=False, export_lights=False, export_normals=True, export_texcoords=True, export_materials="NONE")
print("[props] " + ", ".join(f"{p.name}:{len(p.data.polygons)}" for p in parts) + f" → {args.out}")
