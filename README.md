# TiinyDecide

A local workbench for reusable **System One** decisions. Save the questions once, run them against new input, and take the same workflow to another machine without taking its connection or credentials with you.

## Open it inside DeepSeek Harness

1. In DSH, open **Plugins → Add plugin** and install this repository as a local directory. Use DSH **0.2.2-rc.3 or a compatible 0.2.x release**.
2. Enable **TiinyDecide** if it is not already enabled. Open **TiinyDecide** from the main sidebar (look under **More** if the sidebar is full). If DSH asks for a reload, refresh the current window.
3. Open an example under **Workflows**, or set up your model under **Connections**. The native panel runs inside DSH. It does not open a browser tab or start a second server.

DSH and standalone mode share the same System One executor and workflow export format, but keep separate local data. Use the workflow export and import actions to move work between them. By default DSH keeps its data in `tiiny-decide` under its active profile folder (or `~/.tiiny-decide/dsh` when no profile directory is available). Set `TIINY_DECIDE_DSH_DATA_DIR` in the DSH Host launch environment to override that location. Do not point the standalone server and DSH at the same data directory. For an API key in DSH, use a current-session key or reference a variable available to the DSH Host process; DSH mode does not load the standalone `.env` into the Host environment.

The `tiiny_decide` agent tool uses the same saved workflows and runs as the native pane. Browser session keys are not available to that tool. Set connection addresses and credentials in **Connections**.

## Start the standalone workbench

Use **Node.js 22 or later**. There are no runtime dependencies to install.

```sh
cd tiiny-decide
npm start
```

Open **[http://127.0.0.1:4173](http://127.0.0.1:4173)**. In a DSH workspace, run the same command from the `tiiny-decide` project directory in a background job. TiinyDecide opens in its own browser tab; it is not a DSH plugin. Leave the process running while you use the app. `Ctrl+C` (or stopping the DSH job) stops it.

Optionally copy `.env.example` to `.env` in the project directory before starting. If it contains a key, restrict it to your user (for example, `chmod 600 .env` on macOS/Linux). Variables already set in the shell take precedence. `TIINY_DECIDE_PORT` changes the port and `TIINY_DECIDE_DATA_DIR` changes the local data directory (default: `.data`, relative to the project). Keep any alternate data directory out of your Git repository and use only one server process per data directory. The server always binds to IPv4 loopback. This is a single-user local tool, not a hosted or multi-user service; do not expose it through a public proxy.

## 1. Connect to System One

### Tiiny Pocket

1. In **TiinyOS → Model Store**, download a **Text Classification** model. Load it and confirm it is running. Downloads, loading, and model availability are managed by TiinyOS, not by this workbench. See [Model Management](https://dev.tiiny.ai/#/concepts-model-management).
2. In **Connections**, open **Tiiny Pocket**. Use `http://api.tiiny/v1/systemone`, or replace it with `http://<device-ip>/v1/systemone`. Find the IP in **TiinyOS → Settings → Networks**. Enter the entire URL including `/v1/systemone`.
3. Copy the API key from **TiinyOS → Settings → API Key**. Use **Environment variable** with `TIINY_API_KEY` in your private `.env` (restart afterward), or use **Session key** to supply it in the UI without writing it to disk.
4. Click **Find Pocket models** to list the Text Classification models reported by the device. Pick one to fill in its exact **Model ID**. You can also paste a running model ID directly. The default timeout is **120 seconds**, adjustable to **60–600 seconds**.
5. Click **Test connection** to confirm the selected model can answer a small `choice` question. If Pocket reports that it is still loading, open Model Management in TiinyOS and check the model before testing again. Save the connection when it passes.

The wire protocol is [Tiiny native inference → Text Classification (Jev)](https://dev.tiiny.ai/#/inference-tiiny-sdk). It is not a chat-completions endpoint. Each request contains `model`, `state`, and a `questions` object keyed by question ID. The same IDs identify the response entries in `answers`.

### Custom System One

Create a connection with the **Custom System One** preset. Enter a name, the complete HTTP(S) inference URL, a concrete Model ID, and a timeout. Choose **No authentication**, an environment variable, or a session key. This preset uses the same request and response contract as Tiiny Pocket. Use HTTPS for remote endpoints; only use HTTP on a trusted local connection. Save as many connections as you need, then choose one for each run.

### Connection diagnostics

The test and run result show the upstream HTTP status when one was received. No status usually means no request was sent (for example, a missing configured key), a DNS or network failure, or a client timeout before response headers.

| Status or error | What to check |
| --- | --- |
| `401` / `403` | Supply or replace the Bearer key. |
| `404` | Check the full endpoint path and the running model ID. Do not use `jev-latest` on-device. |
| `400` / `422` | Look for an invalid request, invalid model ID, or non-decision model. |
| `500` | On Tiiny, long input can exceed the model's context window; try a smaller state. |
| `502` / `504` | Check the upstream service or NPU. For `504`, the device's own inference timeout elapsed. |
| `529` | The decision model may still be loading or unavailable. Wait until it is running. If shown, honor `Retry-After`. |
| Invalid response | Confirm the server returns System One JSON with typed answers under `answers`, not chat-completions JSON or HTML. |

The app does not automatically retry upstream requests. It limits local request size separately from the device; keep examples and inputs compact.

## 2. Edit, run, and migrate a workflow

- **Order Inbox** has four sample inputs: ready for pickup, already collected, return pending, and conflicting notices about the same order. It routes to **Action needed**, **Return or order issue**, **Just an update**, or **Needs review**.
- **Message Review** demonstrates a **Noul** (yes/no probability) question independent of order routing.
- Use **Choice** for named options, **Noul** for a yes/no probability, and **Score** for 2–10 ordered descriptions. Set a unique question ID for each. The editor previews the actual System One request for the selected connection and input. JSON state accepts strings, objects, and arrays; text state is sent as entered.
- Save your edits, choose a connection and an example or paste new input, then run. **Model answer** is the service's typed answer; **Workflow result** may differ. In Order Inbox the optional review rule checks all configured option probabilities and sends the result to **Needs review** only if the gap between the top two is strictly below the threshold (default **0.12**). Partial or missing probabilities never trigger the rule. Missing optional response fields are shown as unavailable; no probabilities are invented.
- Use **Duplicate** to branch a workflow. **Export** produces a `tiiny-decide.workflow` JSON document with `version: 1`, questions, rules, and saved examples. On another machine, open **Import**, select the file, then select a connection from that machine. Imports get a new local workflow ID. Connection settings, keys, current unsaved input, and run history are not part of a workflow export.
- In **Runs**, inspect results, reported probabilities, request-to-response elapsed time, and the response JSON. **Run again** uses the stored workflow, input, and connection settings as they were at the time; supply the matching current credential if needed. Export a single run to keep its request/response and result separate from the reusable workflow.

### Try the editor without a real model

In a second terminal inside the project, run:

```sh
npm run demo:upstream
```

In **Connections**, create a **Custom System One** connection named `Synthetic demo`, use `http://127.0.0.1:4181/v1/systemone`, set Model ID to `demo-system-one`, and choose **No authentication**. Save it, select it in **Workflows**, and run the **Conflicting notices** sample. The fixture deliberately gives **Action needed** and **Just an update** near-equal probabilities, so **Workflow result** becomes **Needs review**. The response explicitly identifies itself as synthetic. The fixture returns canned values and is for UI/API verification only, not for evaluating a model.

## 3. Run from a script

`POST /api/run` takes a JSON object containing `connectionId`, `workflowId`, and `state`. The default seeded IDs are `tiiny-pocket`, `order-inbox`, and `message-review`. Use an environment-backed or unauthenticated connection for a script; session keys belong to the browser session that supplied them. `GET /api/connections` and `GET /api/workflows` list local IDs.

```sh
curl -sS --fail-with-body http://127.0.0.1:4173/api/run \
  -H 'Content-Type: application/json' \
  --data-binary '{"connectionId":"tiiny-pocket","workflowId":"order-inbox","state":{"orderId":"TD-104","notice":"Your parcel is ready for pickup today."}}'
```

The browser and scripts use the same executor. An accepted attempt returns `{ "run": { ... } }` and records a history item. Check `run.ok`, `run.upstreamStatus`, and `run.error`, not just the local HTTP status: upstream failures are recorded attempts and return HTTP `200` from the local API. Invalid local inputs or unknown IDs return a `4xx` response with `{ "error": { "code": "…", "message": "…" } }`. Use `GET /api/runs/<run-id>/export` to retrieve a versioned single-run export.

## Local data and credentials

Workflows, connection metadata, and run history live in the local data directory. Input material is sent to the selected endpoint and is also saved with the run. Export files may contain user input, device addresses, or model output; inspect them before sharing. Do not put keys into state, examples, connection URLs, or instructions. Environment variable names are saved, not their values. Session keys are held in server memory and never returned by the API or included in an export; they are lost when the server stops. The workbench has no telemetry.

Run the local automated tests with `npm test`.
