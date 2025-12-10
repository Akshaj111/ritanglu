# -*- coding: utf-8 -*-
import numpy as np

import itertools

from shapely.geometry import Point, Polygon

from shapely.ops import unary_union

from scipy.spatial import ConvexHull

from math import pi, sqrt, sin, cos, tau

import matplotlib.pyplot as plt




# ================================================================

# Helper functions

# ================================================================


def circle_area(r):

    return pi * r * r


def fraction_of_disc_inside_polygon(center, r, polygon: Polygon, resolution=256):

    disc = Point(center).buffer(r, resolution=resolution)

    inter = disc.intersection(polygon)

    return inter.area / disc.area


def generate_grid_points_in_polygon(poly: Polygon):

    minx, miny, maxx, maxy = poly.bounds

    pts = []

    for ix in range(int(np.floor(minx)), int(np.ceil(maxx)) + 1):

        for iy in range(int(np.floor(miny)), int(np.ceil(maxy)) + 1):

            candidate = Point(ix, iy)

            if poly.contains(candidate) or poly.touches(candidate):

                pts.append((ix, iy))

    return pts


def point_coverage_fraction(point, poly: Polygon):

    b = poly.boundary

    if b.contains(Point(point)):

        coords = list(poly.exterior.coords)

        if point not in coords:

            return 1/2


    count = 0

    for v in poly.exterior.coords:

        if abs(v[0] - point[0]) < 1e-9 and abs(v[1] - point[1]) < 1e-9:

            count += 1

    if count > 0:

        return 1.0 / count


    return 1.0


def compute_P(unit_cell: Polygon, discs):

    grid = generate_grid_points_in_polygon(unit_cell)


    covered_points = 0

    weighted_total = 0


    for p in grid:

        frac = point_coverage_fraction(p, unit_cell)

        weighted_total += frac


        for D in discs:

            cx, cy = D['center']

            r = D['r']

            if (p[0]-cx)**2 + (p[1]-cy)**2 <= r*r + 1e-12:

                covered_points += frac

                break


    total_discs = sum(d['frac'] for d in discs)

    if total_discs == 0:

        return 0


    return covered_points / total_discs


def compute_Q(unit_cell: Polygon, discs):

    unit_area = unit_cell.area

    disc_areas = sum(d['frac'] * circle_area(d['r']) for d in discs)

    return disc_areas / unit_area




# ================================================================

# Any-sided polygon generator

# ================================================================


def regular_polygon(n_sides, radius=10, center=(0,0)):

    cx, cy = center

    vertices = []

    for k in range(n_sides):

        angle = tau * k / n_sides

        x = cx + radius*cos(angle)

        y = cy + radius*sin(angle)

        vertices.append((x,y))

    return Polygon(vertices)


def generate_polygons_any_sided(n_min=3, n_max=100, R_list=[10]):

    polys = []

    for R in R_list:

        for n in range(n_min, n_max + 1):

            polys.append(regular_polygon(n, radius=R))

    return polys




# ================================================================

# Disc generator

# ================================================================


def generate_disc_sets(unit_cell,

                       radius_list,

                       max_discs=3):

    grid = generate_grid_points_in_polygon(unit_cell)


    disc_sets = []

    for k in range(1, max_discs + 1):

        for centers in itertools.combinations(grid, k):

            for radius_tuple in itertools.product(radius_list, repeat=k):

                discs = []

                for c, r in zip(centers, radius_tuple):

                    frac = fraction_of_disc_inside_polygon(c, r, unit_cell)

                    if frac > 1e-6:

                        discs.append({'center': c, 'r': r, 'frac': frac})

                if len(discs) > 0:

                    disc_sets.append(discs)


    return disc_sets




# ================================================================

# Search

# ================================================================


def search(polygons, radius_list, max_discs=3):

    best = None

    best_P = -1


    for poly in polygons:

        disc_sets = generate_disc_sets(poly, radius_list, max_discs=max_discs)


        for discs in disc_sets:

            P = compute_P(poly, discs)

            Q = compute_Q(poly, discs)


            if P > best_P or (abs(P - best_P) < 1e-9 and (best is None or Q < best[3])):

                best = (poly, discs, P, Q)

                best_P = P

                print("Found better:", P, Q)


    return best




# ================================================================

# Output formatting

# ================================================================


def output_submission(poly: Polygon, discs, P, Q):

    verts = list(poly.exterior.coords)[:-1]

    print(len(verts))


    for v in verts:

        print(f"{v[0]:.5f},{v[1]:.5f}")


    print(len(discs))


    for d in discs:

        x, y = d['center']

        r = d['r']

        frac = d['frac']

        print(f"{x:.5f},{y:.5f},{r:.5f},{frac:.5f}")


    print(f"{P:.5f}")

    print(f"{Q:.5f}")




# ================================================================

# RUN SEARCH (fixed)

# ================================================================


# Example polygon set:

polys = generate_polygons_any_sided(n_min=4, n_max=12, R_list=[10])


# Example radii:

radii = [1, 2, 3, sqrt(3), 2*sqrt(3) - 3]


# ✅ Corrected search call:

best_poly, best_discs, best_P, best_Q = search(polys, radii, max_discs=3)


# Print results:

output_submission(best_poly, best_discs, best_P, best_Q)


from tqdm import tqdm  # progress bar


def search(polygons, radius_list, max_discs=3):

    best = None

    best_P = -1


    for poly_index, poly in enumerate(polygons):

        disc_sets = generate_disc_sets(poly, radius_list, max_discs=max_discs)

        

        print(f"\n=== Polygon {poly_index} with {len(disc_sets)} disc sets ===")


        # Wrap disc sets with tqdm for a progress bar

        for disc_index, discs in enumerate(tqdm(disc_sets, desc=f"Polygon {poly_index}")):

            P = compute_P(poly, discs)

            Q = compute_Q(poly, discs)


            # Print P and Q for every disc set

            print(f"Disc set {disc_index}: P = {P:.5f}, Q = {Q:.5f}")


            # Keep track of the best

            if P > best_P or (abs(P - best_P) < 1e-9 and (best is None or Q < best[3])):

                best = (poly, discs, P, Q)

                best_P = P

                print(f"--> Found better: P = {P:.5f}, Q = {Q:.5f}")


    return best
