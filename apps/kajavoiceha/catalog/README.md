# Compiler of the approved device catalog

`compile_catalog.py` joins the reviewed workbook to private entity and service
metadata. It does not obtain credentials, register devices, send controls, or
change the backend. Membership, names, location, kind and approved service names
come from the workbook. Empty/unresolved decisions and duplicated private
mappings fail compilation.

The current approved input has headers at row 6: A name, B location, D reviewed
kind, E approved controls, F readable properties, G current states, H possible
states, I availability. D=Ignoruj is excluded. R/V are private mapping columns.
The compiler retains exactly 199 approved devices and excludes 27.

The runtime file contains a revision, eight public field definitions and devices
with private entity/control maps. Controls have neutral IDs, public parameter
schemas, private parameter-name mappings, feature requirements and explicit
support status. Readings have neutral labels, private attributes and value maps.
Names and kinds are preserved exactly; capability checks never depend on kind.

Current state values can be refreshed from `fetch_states.py`. That optional
operator helper uses the existing production SSH alias and server-side protected
credential; it prints only a timestamp/count and writes a sanitized file with
mode 0600. Real inventories, live snapshots and adapter files are ignored by Git
and must not be committed. Deployment keeps its private runtime map outside the
source repository.

`build_catalog.mjs` authors the human-readable eight-column XLSX from the same
public representation with `@oai/artifact-tool`. It requires the bundled runtime
dependencies. Cells summarize related controls without discarding their actions;
the machine representation retains each parameter schema and exact enum values.
The displayed device position is the API row, counted from 1; it is not the
physical Excel worksheet row, because the workbook includes a title and header.

`test_compile_catalog.py` uses fabricated fixtures to test exclusion, accidental
capability grants, unresolved mappings and unknown-state handling. It includes
no production names, identifiers or credentials.
