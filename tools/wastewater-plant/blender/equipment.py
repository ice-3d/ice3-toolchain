import math

import bpy

from geometry import (
    add_box,
    add_curve_pipe,
    add_cylinder,
    add_ladder,
    add_railing,
    add_truss,
    create_material,
    join_parts,
)


EQUIPMENT_COLORS = {
    "concrete": (0.48, 0.50, 0.48),
    "concreteDark": (0.31, 0.33, 0.32),
    "water": (0.08, 0.30, 0.38),
    "sludge": (0.27, 0.18, 0.11),
    "steel": (0.33, 0.37, 0.39),
    "steelDark": (0.13, 0.16, 0.17),
    "equipment": (0.19, 0.32, 0.36),
    "equipmentLight": (0.36, 0.50, 0.52),
    "safety": (0.92, 0.55, 0.07),
    "rubber": (0.075, 0.075, 0.07),
    "air": (0.68, 0.70, 0.68),
}


def create_equipment_materials():
    return {
        key: create_material(f"Equipment.{key}", color, 0.88)
        for key, color in EQUIPMENT_COLORS.items()
    }


def _origin(item):
    x, y, z = item["position"]
    return (x, -z, y)


def _part(name, size, local_position, origin, material, bevel=0.025, rotation=(0.0, 0.0, 0.0)):
    ox, oy, oz = origin
    lx, ly, lz = local_position
    return add_box(
        name,
        size,
        (ox + lx, oy + ly, oz + lz),
        bevel,
        material,
        rotation,
    )


def _cylinder(
    name,
    radius,
    depth,
    local_position,
    origin,
    material,
    vertices=24,
    bevel=0.018,
    rotation=(0.0, 0.0, 0.0),
):
    ox, oy, oz = origin
    lx, ly, lz = local_position
    return add_cylinder(
        name,
        radius,
        depth,
        (ox + lx, oy + ly, oz + lz),
        vertices,
        bevel,
        material,
        rotation,
    )


def _pipe(name, points, origin, material, radius=0.08):
    ox, oy, oz = origin
    world_points = [(ox + x, oy + y, oz + z) for x, y, z in points]
    return add_curve_pipe(name, world_points, radius, material)


def _tank_shell(
    prefix,
    radius,
    height,
    origin,
    material,
    segments=40,
    wall=0.26,
    z_base=0.18,
):
    parts = []
    circumference = 2 * math.pi * radius
    segment_length = circumference / segments * 1.08
    for index in range(segments):
        angle = index * 2 * math.pi / segments
        x = radius * math.cos(angle)
        y = radius * math.sin(angle)
        parts.append(_part(
            f"{prefix}.Shell.{index:02d}",
            (segment_length, wall, height),
            (x, y, z_base + height / 2),
            origin,
            material,
            0.018,
            rotation=(0.0, 0.0, angle + math.pi / 2),
        ))
    return parts


def _ring_band(
    prefix,
    radius,
    height,
    local_z,
    origin,
    material,
    segments=40,
    thickness=0.16,
):
    parts = []
    segment_length = 2 * math.pi * radius / segments * 1.07
    for index in range(segments):
        angle = index * 2 * math.pi / segments
        parts.append(_part(
            f"{prefix}.{index:02d}",
            (segment_length, thickness, height),
            (
                radius * math.cos(angle),
                radius * math.sin(angle),
                local_z,
            ),
            origin,
            material,
            0.012,
            rotation=(0.0, 0.0, angle + math.pi / 2),
        ))
    return parts


def _radial_arm(prefix, length, width, height, local_z, angle, origin, material):
    return _part(
        prefix,
        (length, width, height),
        (length / 2, 0.0, local_z),
        origin,
        material,
        0.018,
        rotation=(0.0, 0.0, angle),
    )


def build_inlet(item, materials):
    origin = _origin(item)
    parts = [
        _part("Inlet.Base", (8.0, 5.8, 0.5), (0, 0, 0.25), origin, materials["concrete"]),
        _part("Inlet.Wall.N", (8.0, 0.42, 2.1), (0, 2.7, 1.25), origin, materials["concrete"]),
        _part("Inlet.Wall.S", (8.0, 0.42, 2.1), (0, -2.7, 1.25), origin, materials["concrete"]),
        _part("Inlet.Wing.N", (2.4, 0.38, 1.8), (-4.5, 3.7, 1.1), origin, materials["concrete"], rotation=(0.0, 0.0, -0.55)),
        _part("Inlet.Wing.S", (2.4, 0.38, 1.8), (-4.5, -3.7, 1.1), origin, materials["concrete"], rotation=(0.0, 0.0, 0.55)),
        _part("Inlet.Water", (7.1, 4.9, 0.10), (-0.2, 0, 0.98), origin, materials["water"], 0.01),
        _part("Inlet.GateFrame.N", (0.28, 0.28, 2.5), (-2.7, 1.8, 1.4), origin, materials["steel"]),
        _part("Inlet.GateFrame.S", (0.28, 0.28, 2.5), (-2.7, -1.8, 1.4), origin, materials["steel"]),
        _part("Inlet.Gate", (0.15, 3.7, 1.8), (-2.7, 0, 1.32), origin, materials["equipment"]),
        _cylinder("Inlet.GateStem", 0.09, 2.0, (-2.7, 0, 3.1), origin, materials["steel"], 16),
        _cylinder("Inlet.GateWheel", 0.48, 0.12, (-2.7, 0, 4.1), origin, materials["safety"], 24),
    ]
    for index in range(10):
        y = -2.05 + index * 0.455
        parts.append(_part(
            f"Inlet.TrashBar.{index:02d}",
            (0.08, 0.07, 1.55),
            (-3.85, y, 1.55),
            origin,
            materials["steelDark"],
            0.004,
            rotation=(0.0, -0.28, 0.0),
        ))
    parts.extend(_ring_band(
        "Inlet.Handrail",
        4.05,
        0.07,
        2.62,
        origin,
        materials["safety"],
        segments=18,
        thickness=0.06,
    ))
    for side in (-1, 1):
        parts.append(_part(
            f"Inlet.Coping.{side}",
            (7.8, 0.60, 0.18),
            (0, side * 2.68, 2.35),
            origin,
            materials["concreteDark"],
        ))
    return parts


def build_bar_screen(item, materials):
    origin = _origin(item)
    parts = [
        _part("Screen.Base", (8.4, 4.6, 0.55), (0, 0, 0.27), origin, materials["concrete"]),
        _part("Screen.Wall.N", (8.4, 0.38, 2.35), (0, 2.15, 1.42), origin, materials["concrete"]),
        _part("Screen.Wall.S", (8.4, 0.38, 2.35), (0, -2.15, 1.42), origin, materials["concrete"]),
        _part("Screen.Water", (7.3, 3.6, 0.08), (0, 0, 0.92), origin, materials["water"], 0.006),
        _part("Screen.Rack.Top", (0.29, 3.7, 0.25), (0.75, 0, 2.55), origin, materials["steel"]),
        _part("Screen.Rack.Bottom", (0.29, 3.7, 0.25), (-1.35, 0, 0.83), origin, materials["steel"]),
        _part("Screen.Motor", (0.75, 0.55, 0.75), (0.35, 0, 3.05), origin, materials["equipment"]),
        _part("Screen.Gearbox", (0.55, 0.42, 0.52), (1.0, 0, 2.10), origin, materials["steelDark"]),
        _part("Screen.RakeShaft", (1.8, 0.12, 0.12), (-0.2, 0, 1.45), origin, materials["steel"], rotation=(0.0, 0.72, 0.0)),
        _part("Screen.ScreeningsChute", (1.15, 0.82, 0.18), (2.25, 0, 1.45), origin, materials["steelDark"], rotation=(0.0, -0.28, 0.0)),
        _part("Screen.Bin", (1.25, 1.25, 1.15), (3.45, 0, 0.85), origin, materials["equipmentLight"]),
        _part("Screen.BinLip", (1.4, 1.4, 0.10), (3.45, 0, 1.48), origin, materials["safety"]),
    ]
    for index in range(25):
        y = -1.72 + index * (3.44 / 24)
        parts.append(_part(
            f"Screen.Bar.{index:02d}",
            (0.075, 0.065, 2.42),
            (-0.3, y, 1.65),
            origin,
            materials["steelDark"],
            0.003,
            rotation=(0.0, -0.58, 0.0),
        ))
    for index in range(7):
        parts.append(_part(
            f"Screen.RakeTooth.{index:02d}",
            (0.08, 0.06, 0.42),
            (-0.65, -1.55 + index * 0.52, 1.45),
            origin,
            materials["safety"],
            0.002,
            rotation=(0.0, -0.58, 0.0),
        ))
    parts.extend(_rail_segments(
        "Screen.Rail",
        (-4.0, 2.32),
        (4.0, 2.32),
        0.25,
        origin,
        materials["safety"],
    ))
    return parts


def _rail_segments(name, start, end, z, origin, material):
    ox, oy, oz = origin
    return [add_railing(
        name,
        (ox + start[0], oy + start[1]),
        (ox + end[0], oy + end[1]),
        1.05,
        material,
        oz + z,
    )]


def build_pump(item, materials):
    origin = _origin(item)
    parts = [
        _part("Pump.Foundation", (4.8, 2.8, 0.42), (0, 0, 0.21), origin, materials["concrete"]),
        _part("Pump.Rail.L", (4.1, 0.28, 0.20), (0, 0.78, 0.52), origin, materials["steelDark"]),
        _part("Pump.Rail.R", (4.1, 0.28, 0.20), (0, -0.78, 0.52), origin, materials["steelDark"]),
        _part("Pump.Skid", (3.2, 1.45, 0.26), (0, 0, 0.68), origin, materials["equipment"]),
        _cylinder("Pump.Volute", 0.78, 0.72, (-0.65, 0, 1.30), origin, materials["equipment"], 32, rotation=(0.0, math.pi / 2, 0.0)),
        _cylinder("Pump.VoluteHub", 0.34, 0.86, (-0.65, 0, 1.30), origin, materials["equipmentLight"], 24, rotation=(0.0, math.pi / 2, 0.0)),
        _cylinder("Pump.Motor", 0.56, 1.42, (0.85, 0, 1.30), origin, materials["equipmentLight"], 28, rotation=(0.0, math.pi / 2, 0.0)),
        _cylinder("Pump.MotorFin", 0.69, 1.05, (0.85, 0, 1.30), origin, materials["steel"], 18, rotation=(0.0, math.pi / 2, 0.0)),
        _cylinder("Pump.Coupling", 0.31, 0.48, (0.03, 0, 1.30), origin, materials["steel"], 20, rotation=(0.0, math.pi / 2, 0.0)),
        _part("Pump.CouplingGuard", (0.62, 0.72, 0.55), (0.03, 0, 1.38), origin, materials["safety"], 0.06),
        _pipe("Pump.Suction", ((-1.5, 0, 1.30), (-1.5, 0, 0.45), (-2.35, 0, 0.45)), origin, materials["water"], 0.21),
        _pipe("Pump.Discharge", ((-0.65, 0, 1.91), (-0.65, 0, 2.70), (0.7, 0, 2.70), (0.7, 0, 2.15)), origin, materials["water"], 0.17),
        _cylinder("Pump.DischargeValve", 0.27, 0.30, (0.7, 0, 2.30), origin, materials["safety"], 20),
        _cylinder("Pump.ValveStem", 0.06, 0.72, (0.7, 0, 2.73), origin, materials["steel"], 12),
        _cylinder("Pump.Handwheel", 0.36, 0.09, (0.7, 0, 3.10), origin, materials["safety"], 20),
        _cylinder("Pump.Gauge", 0.17, 0.12, (0.35, -0.12, 2.72), origin, materials["steelDark"], 18),
    ]
    for index in range(5):
        parts.append(_part(
            f"Pump.MotorRib.{index:02d}",
            (0.06, 1.42, 0.07),
            (-0.01 + index * 0.30, 0, 1.87),
            origin,
            materials["steelDark"],
            0.003,
        ))
    return parts


def build_grit_basin(item, materials):
    origin = _origin(item)
    parts = [
        _part("Grit.Base", (10.5, 7.6, 0.55), (0, 0, 0.28), origin, materials["concrete"]),
        _part("Grit.Wall.N", (10.5, 0.42, 3.0), (0, 3.55, 1.55), origin, materials["concrete"]),
        _part("Grit.Wall.S", (10.5, 0.42, 3.0), (0, -3.55, 1.55), origin, materials["concrete"]),
        _part("Grit.Wall.W", (0.42, 7.6, 3.0), (-5.05, 0, 1.55), origin, materials["concrete"]),
        _part("Grit.Wall.E", (0.42, 7.6, 3.0), (5.05, 0, 1.55), origin, materials["concrete"]),
        _part("Grit.Water", (9.4, 6.6, 0.10), (0, 0, 1.22), origin, materials["water"], 0.01),
        _part("Grit.Bridge.Deck", (0.72, 7.2, 0.18), (0.8, 0, 3.16), origin, materials["steel"]),
        _part("Grit.Bridge.Beam.N", (0.18, 7.15, 0.28), (0.8, 0, 2.94), origin, materials["steelDark"]),
        _part("Grit.Scraper", (8.8, 0.25, 0.28), (0.6, 0, 0.82), origin, materials["steelDark"]),
        _part("Grit.SandHopper", (2.3, 2.1, 0.7), (-3.5, -2.1, 0.70), origin, materials["concreteDark"], 0.15),
        _pipe("Grit.AirHeader", ((-4.3, -2.8, 3.35), (4.3, -2.8, 3.35)), origin, materials["air"], 0.10),
    ]
    for index in range(6):
        x = -3.8 + index * 1.52
        parts.append(_pipe(
            f"Grit.AirBranch.{index:02d}",
            ((x, -2.8, 3.30), (x, -2.8, 2.05), (x, -0.4, 2.05)),
            origin,
            materials["air"],
            0.045,
        ))
        for bubble_index in range(3):
            parts.append(_cylinder(
                f"Grit.AirDrop.{index:02d}.{bubble_index:02d}",
                0.06,
                1.4,
                (x, -0.4 + bubble_index * 0.55, 1.42),
                origin,
                materials["air"],
                10,
            ))
    for side in (-1, 1):
        parts.append(add_ladder(
            f"Grit.Ladder.{side}",
            origin[0] + 5.35,
            origin[1] + side * 2.6,
            3.0,
            materials["safety"],
            origin[2],
        ))
    parts.extend(_ring_band(
        "Grit.Rail",
        4.8,
        0.06,
        3.85,
        origin,
        materials["safety"],
        segments=28,
        thickness=0.06,
    ))
    return parts


def build_grit_classifier(item, materials):
    origin = _origin(item)
    parts = [
        _part("Classifier.Skid", (5.5, 2.8, 0.35), (0, 0, 0.18), origin, materials["steelDark"]),
        _cylinder("Classifier.ScrewCasing", 0.72, 4.6, (0, 0, 1.0), origin, materials["equipment"], 28, rotation=(0, math.pi / 2, 0)),
        _cylinder("Classifier.Motor", 0.44, 1.0, (2.35, 0, 1.62), origin, materials["equipmentLight"], 24, rotation=(0, math.pi / 2, 0)),
        _part("Classifier.DischargeBox", (1.3, 1.3, 1.3), (-2.45, 0, 1.18), origin, materials["equipment"]),
        _pipe("Classifier.SandInlet", ((-1.8, 0, 2.25), (-1.8, 0, 3.1), (-3.5, 0, 3.1)), origin, materials["sludge"], 0.16),
        _pipe("Classifier.WaterOutlet", ((1.6, 0, 1.15), (1.6, 0, 0.5), (3.0, 0, 0.5)), origin, materials["water"], 0.13),
    ]
    for index in range(9):
        parts.append(_cylinder(
            f"Classifier.ScrewFlight.{index:02d}",
            0.82,
            0.12,
            (-1.7 + index * 0.42, 0, 1.0),
            origin,
            materials["steel"],
            20,
            rotation=(0.0, math.pi / 2, index * 0.4),
        ))
    return parts


def build_rectangular_clarifier(item, materials):
    origin = _origin(item)
    parts = [
        _part("Primary.Base", (13.0, 10.8, 0.55), (0, 0, 0.28), origin, materials["concrete"]),
        _part("Primary.Wall.N", (13.0, 0.48, 3.2), (0, 5.15, 1.65), origin, materials["concrete"]),
        _part("Primary.Wall.S", (13.0, 0.48, 3.2), (0, -5.15, 1.65), origin, materials["concrete"]),
        _part("Primary.Wall.W", (0.48, 10.8, 3.2), (-6.25, 0, 1.65), origin, materials["concrete"]),
        _part("Primary.Wall.E", (0.48, 10.8, 3.2), (6.25, 0, 1.65), origin, materials["concrete"]),
        _part("Primary.Water", (11.8, 9.7, 0.10), (0, 0, 0.92), origin, materials["water"], 0.01),
        _part("Primary.Bridge.Deck", (0.75, 11.2, 0.18), (-0.8, 0, 3.50), origin, materials["steel"]),
        _part("Primary.Bridge.Beam.N", (0.18, 11.0, 0.30), (-0.8, 0, 3.25), origin, materials["steelDark"]),
        _part("Primary.ScraperBeam", (12.2, 0.42, 0.45), (0, 0, 0.65), origin, materials["steelDark"]),
        _part("Primary.SludgeHopper", (3.2, 3.0, 1.0), (3.8, 0, 0.5), origin, materials["concreteDark"], 0.15),
        _part("Primary.Weir.N", (12.4, 0.16, 0.28), (0, 4.45, 2.58), origin, materials["steelDark"]),
        _part("Primary.Weir.S", (12.4, 0.16, 0.28), (0, -4.45, 2.58), origin, materials["steelDark"]),
        _pipe("Primary.Outlet", ((4.8, -4.5, 2.45), (4.8, -6.1, 2.45), (4.8, -6.1, 0.5)), origin, materials["water"], 0.17),
    ]
    for index in range(14):
        y = -4.1 + index * 0.63
        parts.append(_part(
            f"Primary.ScraperBlade.{index:02d}",
            (0.42, 0.55, 0.18),
            (-5.4 + index * 0.78, -4.1 + index * 0.63, 0.62),
            origin,
            materials["steelDark"],
        ))
    for side in (-1, 1):
        parts.append(_part(
            f"Primary.WalkwayRail.{side}",
            (13.0, 0.07, 0.07),
            (0, side * 5.55, 4.25),
            origin,
            materials["safety"],
        ))
        for index in range(7):
            parts.append(_part(
                f"Primary.RailPost.{side}.{index:02d}",
                (0.06, 0.06, 1.05),
                (-5.8 + index * 1.93, side * 5.55, 3.72),
                origin,
                materials["safety"],
            ))
    return parts


def build_distribution_well(item, materials):
    origin = _origin(item)
    parts = [
        _part("Well.Foundation", (5.4, 5.4, 0.45), (0, 0, 0.22), origin, materials["concrete"]),
    ]
    parts.extend(_tank_shell(
        "Well",
        2.35,
        2.8,
        origin,
        materials["concrete"],
        segments=32,
        wall=0.32,
        z_base=0.38,
    ))
    parts.extend(_ring_band(
        "Well.Coping",
        2.42,
        0.16,
        3.28,
        origin,
        materials["concreteDark"],
        segments=32,
        thickness=0.42,
    ))
    parts.extend([
        _cylinder("Well.Water", 2.0, 0.09, (0, 0, 1.25), origin, materials["water"], 32, 0.005),
        _cylinder("Well.InletColumn", 0.50, 2.2, (0, 0, 1.55), origin, materials["concreteDark"], 24),
        _pipe("Well.Inlet", ((-2.8, 0, 2.4), (-1.1, 0, 2.4), (-0.5, 0, 1.85)), origin, materials["water"], 0.19),
        _pipe("Well.OutletA", ((1.0, 0, 1.4), (2.7, 0, 1.4), (3.2, 0, 0.55)), origin, materials["water"], 0.16),
        _pipe("Well.OutletB", ((0, 1.0, 1.4), (0, 2.7, 1.4), (0, 3.2, 0.55)), origin, materials["water"], 0.16),
        _cylinder("Well.GateWheel", 0.38, 0.08, (2.1, 0, 3.2), origin, materials["safety"], 24),
        _cylinder("Well.GateStem", 0.055, 1.2, (2.1, 0, 2.65), origin, materials["steel"], 12),
    ])
    return parts


def build_biological_reactor(item, materials):
    origin = _origin(item)
    parts = [
        _part("Reactor.Base", (12.2, 15.0, 0.48), (0, 0, 0.24), origin, materials["concrete"]),
        _part("Reactor.Wall.N", (12.2, 0.45, 3.25), (0, 7.25, 1.65), origin, materials["concrete"]),
        _part("Reactor.Wall.S", (12.2, 0.45, 3.25), (0, -7.25, 1.65), origin, materials["concrete"]),
        _part("Reactor.Wall.W", (0.45, 15.0, 3.25), (-6.1, 0, 1.65), origin, materials["concrete"]),
        _part("Reactor.Wall.E", (0.45, 15.0, 3.25), (6.1, 0, 1.65), origin, materials["concrete"]),
        _part("Reactor.Walkway", (11.7, 1.55, 0.16), (0, 0, 3.15), origin, materials["steel"]),
        _part("Reactor.AirHeader", (11.2, 0.16, 0.16), (0, -6.6, 2.72), origin, materials["air"]),
    ]
    for compartment, center_x in enumerate((-4.0, 0.0, 4.0)):
        if compartment < 2:
            parts.append(_part(
                f"Reactor.Compartment.{compartment}.Water",
                (3.45, 13.7, 0.08),
                (center_x, 0, 1.18),
                origin,
                materials["water"],
                0.006,
            ))
        if compartment > 0:
            parts.append(_part(
                f"Reactor.Divider.{compartment}",
                (0.32, 14.4, 2.8),
                (center_x - 2.0, 0, 1.42),
                origin,
                materials["concreteDark"],
            ))
        for row in range(3):
            for column in range(3):
                parts.append(_cylinder(
                    f"Reactor.Diffuser.{compartment}.{row}.{column}",
                    0.24,
                    0.12,
                    (center_x - 1.1 + column * 1.1, -4.6 + row * 4.6, 1.30),
                    origin,
                    materials["air"],
                    18,
                ))
                parts.append(_pipe(
                    f"Reactor.DiffuserDrop.{compartment}.{row}.{column}",
                    (
                        (center_x - 1.1 + column * 1.1, -4.6 + row * 4.6, 1.34),
                        (center_x - 1.1 + column * 1.1, -6.2, 1.72),
                        (center_x - 1.1 + column * 1.1, -6.2, 2.66),
                    ),
                    origin,
                    materials["air"],
                    0.035,
                ))
    for side in (-1, 1):
        parts.append(add_railing(
            f"Reactor.WalkwayRail.{side}",
            (origin[0] - 5.7, origin[1] + side * 0.92),
            (origin[0] + 5.7, origin[1] + side * 0.92),
            1.08,
            materials["safety"],
            origin[2] + 3.16,
        ))
    for index in range(4):
        parts.append(_cylinder(
            f"Reactor.AirValve.{index:02d}",
            0.15,
            0.36,
            (-4.5 + index * 3.0, 6.6, 2.55),
            origin,
            materials["safety"],
            18,
        ))
    parts.extend(_rail_segments(
        "Reactor.PerimeterRail.N",
        (-5.7, 6.95),
        (5.7, 6.95),
        3.15,
        origin,
        materials["safety"],
    ))
    parts.extend(_rail_segments(
        "Reactor.PerimeterRail.S",
        (-5.7, -6.95),
        (5.7, -6.95),
        3.15,
        origin,
        materials["safety"],
    ))
    return parts


def build_circular_clarifier(item, materials):
    origin = _origin(item)
    radius = 7.25
    parts = [
        _part("Clarifier.Foundation", (15.8, 15.8, 0.38), (0, 0, 0.19), origin, materials["concrete"]),
        _cylinder("Clarifier.Water", radius - 0.32, 0.10, (0, 0, 1.02), origin, materials["water"], 40, 0.005),
    ]
    parts.extend(_tank_shell(
        "Clarifier",
        radius,
        2.75,
        origin,
        materials["concrete"],
        segments=26,
        wall=0.30,
        z_base=0.28,
    ))
    parts.extend(_ring_band(
        "Clarifier.Coping",
        7.26,
        0.16,
        3.02,
        origin,
        materials["concreteDark"],
        segments=26,
        thickness=0.44,
    ))
    parts.extend(_ring_band(
        "Clarifier.Launder",
        6.10,
        0.42,
        2.23,
        origin,
        materials["concreteDark"],
        segments=24,
        thickness=0.18,
    ))
    parts.extend(_ring_band(
        "Clarifier.Weir",
        5.80,
        0.31,
        2.50,
        origin,
        materials["steel"],
        segments=24,
        thickness=0.08,
    ))
    parts.extend(_ring_band(
        "Clarifier.ScumBaffle",
        5.32,
        0.62,
        2.35,
        origin,
        materials["steelDark"],
        segments=22,
        thickness=0.07,
    ))
    parts.extend([
        _cylinder("Clarifier.FeedWell", 1.72, 2.55, (0, 0, 1.52), origin, materials["concreteDark"], 40),
        _cylinder("Clarifier.FeedWellCap", 1.95, 0.24, (0, 0, 2.90), origin, materials["concrete"], 40),
        _cylinder("Clarifier.CenterDrive", 1.05, 1.25, (0, 0, 3.00), origin, materials["equipment"], 32),
        _cylinder("Clarifier.DriveMotor", 0.47, 0.85, (0.3, 0, 3.85), origin, materials["equipmentLight"], 24),
        _part("Clarifier.Bridge.Deck", (13.2, 1.30, 0.16), (0, 0, 3.82), origin, materials["steel"]),
        _part("Clarifier.Bridge.Guardrail.N", (13.3, 0.07, 0.07), (0, 0.66, 4.85), origin, materials["safety"]),
        _part("Clarifier.Bridge.Guardrail.S", (13.3, 0.07, 0.07), (0, -0.66, 4.85), origin, materials["safety"]),
        _part("Clarifier.ScraperArm.A", (11.4, 0.32, 0.34), (2.0, 0, 0.67), origin, materials["steelDark"], rotation=(0, 0, 0.43)),
        _part("Clarifier.ScraperArm.B", (11.4, 0.32, 0.34), (-2.0, 0, 0.67), origin, materials["steelDark"], rotation=(0, 0, 0.43)),
        _part("Clarifier.OutletPipe", (1.3, 0.42, 0.42), (6.65, -1.2, 2.35), origin, materials["water"]),
    ])
    parts.extend(_ring_band(
        "Clarifier.BridgePost",
        5.4,
        1.0,
        4.35,
        origin,
        materials["safety"],
        segments=13,
        thickness=0.055,
    ))
    bridge_truss = add_truss(
        "Clarifier.HalfBridgeTruss",
        (origin[0], origin[1]),
        (origin[0] + 6.7, origin[1]),
        origin[2] + 3.43,
        1.05,
        0.80,
        materials["steel"],
    )
    parts.append(bridge_truss)
    for index in range(10):
        angle = -0.45 + index * 0.10
        parts.append(_radial_arm(
            f"Clarifier.ScraperBlade.{index:02d}",
            5.2,
            0.18,
            0.24,
            0.56,
            angle,
            origin,
            materials["steelDark"],
        ))
    parts.append(add_ladder(
        "Clarifier.Ladder",
        origin[0] + 7.55,
        origin[1],
        3.1,
        materials["safety"],
        origin[2],
    ))
    parts.append(_pipe(
        "Clarifier.Outlet",
        ((6.6, -1.2, 2.35), (8.0, -1.2, 2.35), (8.0, -1.2, 0.55)),
        origin,
        materials["water"],
        0.18,
    ))
    return parts


def build_blower(item, materials):
    origin = _origin(item)
    parts = [
        _part("Blower.Foundation", (6.2, 3.8, 0.38), (0, 0, 0.19), origin, materials["concrete"]),
        _part("Blower.Skid.L", (5.8, 0.30, 0.28), (0, 1.2, 0.50), origin, materials["steelDark"]),
        _part("Blower.Skid.R", (5.8, 0.30, 0.28), (0, -1.2, 0.50), origin, materials["steelDark"]),
        _part("Blower.Enclosure", (2.15, 2.15, 1.75), (-0.75, 0, 1.45), origin, materials["equipment"], 0.12),
        _part("Blower.EnclosurePanel.N", (2.10, 0.07, 1.38), (-0.75, 1.06, 1.50), origin, materials["equipmentLight"]),
        _part("Blower.EnclosurePanel.S", (2.10, 0.07, 1.38), (-0.75, -1.06, 1.50), origin, materials["equipmentLight"]),
        _part("Blower.EnclosurePanel.E", (0.07, 2.10, 1.38), (0.32, 0, 1.50), origin, materials["equipmentLight"]),
        _cylinder("Blower.Motor", 0.56, 1.78, (1.62, 0, 1.33), origin, materials["equipmentLight"], 30, rotation=(0.0, math.pi / 2, 0.0)),
        _cylinder("Blower.MotorCap", 0.62, 0.20, (2.52, 0, 1.33), origin, materials["steelDark"], 24, rotation=(0.0, math.pi / 2, 0.0)),
        _cylinder("Blower.FlexibleConnector", 0.39, 0.72, (0.65, 0, 1.33), origin, materials["rubber"], 24, rotation=(0.0, math.pi / 2, 0.0)),
        _cylinder("Blower.IntakeFilter", 0.54, 0.80, (-2.25, 0, 1.52), origin, materials["steel"], 24, rotation=(0.0, math.pi / 2, 0.0)),
        _cylinder("Blower.Silencer", 0.48, 1.15, (-3.05, 0, 1.52), origin, materials["equipment"], 24, rotation=(0.0, math.pi / 2, 0.0)),
        _pipe("Blower.Discharge", ((0.95, 0, 1.33), (0.95, 0, 2.55), (2.35, 0, 2.55), (2.35, 0, 1.35)), origin, materials["air"], 0.21),
        _cylinder("Blower.CheckValve", 0.29, 0.40, (2.35, 0, 1.82), origin, materials["safety"], 22),
        _cylinder("Blower.Gauge", 0.15, 0.11, (1.65, -0.12, 2.65), origin, materials["steelDark"], 18),
    ]
    for index in range(9):
        parts.append(_cylinder(
            f"Blower.ConnectorRib.{index:02d}",
            0.415,
            0.045,
            (0.33 + index * 0.085, 0, 1.33),
            origin,
            materials["steelDark"],
            20,
            rotation=(0.0, math.pi / 2, 0.0),
        ))
    for index in range(5):
        parts.append(_part(
            f"Blower.EnclosureLouver.{index:02d}",
            (1.55, 0.05, 0.055),
            (-0.75, -1.12, 1.02 + index * 0.22),
            origin,
            materials["steelDark"],
            0.002,
        ))
    return parts


BUILDERS = {
    "inlet": build_inlet,
    "bar-screen": build_bar_screen,
    "pump": build_pump,
    "grit-basin": build_grit_basin,
    "grit-classifier": build_grit_classifier,
    "rectangular-clarifier": build_rectangular_clarifier,
    "distribution-well": build_distribution_well,
    "biological-reactor": build_biological_reactor,
    "circular-clarifier": build_circular_clarifier,
    "blower": build_blower,
}


def build_equipment(item, materials):
    builder = BUILDERS.get(item["kind"])
    if builder is None:
        origin = _origin(item)
        parts = [
            _part(
                "Placeholder.Base",
                (4.0, 3.0, 0.4),
                (0, 0, 0.2),
                origin,
                materials["concrete"],
            ),
            _part(
                "Placeholder.Body",
                (3.0, 2.3, 2.0),
                (0, 0, 1.4),
                origin,
                materials["equipment"],
            ),
        ]
    else:
        parts = builder(item, materials)
    joined = join_parts(parts, item["tag"])
    for polygon in joined.data.polygons:
        polygon.use_smooth = False
    return joined
