# Plugin Framework (M23)

Architecture cell: `plugin`  
Map delta: update required (cell → active)

## Idea

Third-party (and official) extensions talk to the Hub only through a **capability whitelist**. Sensitive capabilities need an operator **grant**. Iron Laws permanently block `config.write` and `store.flush`.

## Deliverables

| Piece | Role |
|-------|------|
| `plugins/catalog.json` | Official catalog shell |
| `plugins/examples/hello-mac` | Installable example (`plugin.json`) |
| `PluginHost` | install / activate / grant / call + in-memory call receipts |
| Hub **Plugins** tab | Operator UI for the lifecycle |

Stdio process supervision is reserved (`runtime: "stdio"` refused until a supervisor ships). Hello Mac is **in-process**.

## Host capabilities

| Capability | Needs grant? | Notes |
|------------|--------------|-------|
| `hub.notify` | no | Safe ping once active |
| `thread.read` | no | Read thread metadata |
| `thread.post_message` | **yes** | Posts system message as `plugin:<id>` |
| `memory.write` | **yes** | Settlement stub |
| `config.write` | hard deny | Iron Law |
| `store.flush` | hard deny | Iron Law |

## API

| Method | Path | Role |
|--------|------|------|
| GET | `/api/plugins/catalog` | Catalog shell |
| GET | `/api/plugins` | Records + receipts |
| POST | `/api/plugins/:id/install` | Install from catalog |
| POST | `/api/plugins/:id/uninstall` | Uninstall (must deactivate first) |
| POST | `/api/plugins/:id/activate` | Activate |
| POST | `/api/plugins/:id/deactivate` | Deactivate |
| POST | `/api/plugins/:id/grants` | Grant capability |
| DELETE | `/api/plugins/:id/grants/:capability` | Revoke |
| POST | `/api/plugins/:id/call` | Invoke; returns settled receipt |

## Hub demo

1. Plugins → **Install** hello-mac → **Activate**  
2. **Call hub.notify** → receipt `ok`  
3. **Call thread.post_message** without grant → receipt `denied`  
4. **Grant thread.post_message** → call again on open thread → chat shows plugin message  
5. **Deactivate** → **Uninstall**

## Done criteria

- Example plugin can install / uninstall  
- Without grant, sensitive capabilities cannot run  
- Official catalog shell present
