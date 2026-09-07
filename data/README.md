# Road data

`delhi-roads.osm.json` was retrieved from the public Overpass API on 2026-09-06. Its OSM base timestamp is embedded in `osm3s.timestamp_osm_base`.

Copyright © OpenStreetMap contributors. Data licensed under ODbL: https://www.openstreetmap.org/copyright and https://opendatacommons.org/licenses/odbl/1-0/.

Query:

```overpass
[out:json][timeout:30];
way[highway][highway!~"footway|path|steps|cycleway|pedestrian"](28.608,77.200,28.618,77.232);
(._;>;);
out body;
```

The importer produces 2,692 nodes and 4,411 directed edges from this snapshot. The graph is independently sourced road geometry, not the synthetic reference trajectory. It includes service roads; motor-vehicle access restrictions and turn restriction relations are not enforced. This prototype matcher is not a routing safety system.
