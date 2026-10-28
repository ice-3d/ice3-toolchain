import bpy


def create_material(name, color, roughness=0.82):
    existing = bpy.data.materials.get(name)
    if existing is not None:
        return existing
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.roughness = roughness
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Roughness"].default_value = roughness
    return mat


def assign_material(obj, material):
    if material is not None:
        obj.data.materials.append(material)
    return obj


def move_to_collection(obj, collection):
    for owner in list(obj.users_collection):
        owner.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def parent_to(obj, parent):
    if parent is None:
        return obj
    obj.parent = parent
    obj.matrix_parent_inverse = parent.matrix_world.inverted()
    return obj


def create_group(name, collection, parent=None):
    group = bpy.data.objects.new(name, None)
    collection.objects.link(group)
    parent_to(group, parent)
    return group


def apply_bevel(obj, width=0.04, segments=1):
    if width <= 0:
        return
    modifier = obj.modifiers.new("Edge Chamfer", "BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def add_box(
    name,
    size,
    location,
    bevel=0.04,
    material=None,
    rotation=(0.0, 0.0, 0.0),
):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = size
    obj.rotation_euler = rotation
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    apply_bevel(obj, bevel)
    assign_material(obj, material)
    return obj


def add_cylinder(
    name,
    radius,
    depth,
    location,
    vertices=32,
    bevel=0.02,
    material=None,
    rotation=(0.0, 0.0, 0.0),
):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    apply_bevel(obj, min(bevel, radius * 0.12, depth * 0.12))
    assign_material(obj, material)
    return obj


def add_curve_pipe(name, points, radius, material=None, resolution=8):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = resolution
    curve.bevel_depth = radius
    curve.bevel_resolution = 2
    curve.resolution_u = 4
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, value in zip(spline.bezier_points, points):
        point.co = value
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    assign_material(obj, material)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target="MESH")
    return bpy.context.object


def join_parts(parts, root_name):
    parts = [part for part in parts if part is not None]
    if not parts:
        raise ValueError(f"cannot join empty part list: {root_name}")
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    joined = bpy.context.object
    joined.name = root_name
    return joined


def add_railing(
    name,
    start,
    end,
    height,
    material=None,
    z_base=0.0,
    post_spacing=1.8,
):
    start_x, start_y = start
    end_x, end_y = end
    dx = end_x - start_x
    dy = end_y - start_y
    length = max((dx * dx + dy * dy) ** 0.5, 0.001)
    count = max(2, int(length / post_spacing) + 1)
    parts = []
    for index in range(count):
        t = index / (count - 1)
        x = start_x + dx * t
        y = start_y + dy * t
        parts.append(add_box(
            f"{name}.Post.{index:02d}",
            (0.07, 0.07, height),
            (x, y, z_base + height / 2),
            0.008,
            material,
        ))
    angle = -__import__("math").atan2(dy, dx)
    for index, rail_height in enumerate((0.55, height)):
        parts.append(add_box(
            f"{name}.Rail.{index:02d}",
            (length, 0.055, 0.055),
            (
                start_x + dx / 2,
                start_y + dy / 2,
                z_base + rail_height,
            ),
            0.006,
            material,
            rotation=(0.0, 0.0, angle),
        ))
    return join_parts(parts, name)


def add_ladder(name, x, y, height, material=None, z_base=0.0):
    parts = [
        add_box(
            f"{name}.Stringer.L",
            (0.055, 0.055, height),
            (x - 0.24, y, z_base + height / 2),
            0.004,
            material,
        ),
        add_box(
            f"{name}.Stringer.R",
            (0.055, 0.055, height),
            (x + 0.24, y, z_base + height / 2),
            0.004,
            material,
        ),
    ]
    rung_count = max(2, int(height / 0.3))
    for index in range(1, rung_count):
        z = z_base + index * height / rung_count
        parts.append(add_box(
            f"{name}.Rung.{index:02d}",
            (0.48, 0.035, 0.035),
            (x, y, z),
            0.002,
            material,
        ))
    return join_parts(parts, name)


def add_truss(
    name,
    start,
    end,
    z,
    width,
    height,
    material=None,
):
    sx, sy = start
    ex, ey = end
    dx = ex - sx
    dy = ey - sy
    length = max((dx * dx + dy * dy) ** 0.5, 0.001)
    angle = -__import__("math").atan2(dy, dx)
    parts = [
        add_box(
            f"{name}.Chord.T",
            (length, width * 0.14, height * 0.12),
            ((sx + ex) / 2, (sy + ey) / 2, z + height / 2),
            0.008,
            material,
            rotation=(0.0, 0.0, angle),
        ),
        add_box(
            f"{name}.Chord.B",
            (length, width * 0.14, height * 0.12),
            ((sx + ex) / 2, (sy + ey) / 2, z - height / 2),
            0.008,
            material,
            rotation=(0.0, 0.0, angle),
        ),
    ]
    count = max(3, int(length / 1.8) + 1)
    for index in range(count):
        t = index / (count - 1)
        parts.append(add_box(
            f"{name}.Web.{index:02d}",
            (0.08, width * 0.12, height),
            (sx + dx * t, sy + dy * t, z),
            0.005,
            material,
            rotation=(0.0, 0.0, angle),
        ))
    return join_parts(parts, name)
