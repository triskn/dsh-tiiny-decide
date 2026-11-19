# TiinyDecide for DeepSeek Harness

TiinyDecide is a DSH sidebar plugin for running reusable System One decisions on Tiiny Pocket. Define a decision once, run it on new inputs, and use a review rule to flag close calls. In **Runs**, you can see the model's original answer alongside the workflow's final result.

## Install in DSH

1. Download the source from [GitHub](https://github.com/triskn/dsh-tiiny-decide) and unzip it, or clone the repository.
2. In DeepSeek Harness **0.2.2-rc.3 or a compatible 0.2.x release**, open **Plugins → Add plugin** and select the project folder.
3. Enable **TiinyDecide** and open it from the DSH sidebar. Check **More** if the sidebar is full.

If you installed the plugin under its previous package name, `tiiny-decide`, disable that entry before adding `dsh-tiiny-decide`. The new package uses the same DSH profile data, so saved workflows, connections, and run history carry over.

## Connect Tiiny Pocket

1. In **TiinyOS → Model Store**, download a **Text Classification** model, such as `d3-edge`, and load it. [TiinyOS model management](https://dev.tiiny.ai/#/concepts-model-management)
2. In the plugin's **Connections** tab, choose **Tiiny Pocket**. Use `http://api.tiiny/v1/systemone` or the device's IP address with the same `/v1/systemone` path. You can find that address in **TiinyOS → Settings → Networks**.
3. Copy the key from **TiinyOS → Settings → API Key**. Choose **Current session key** to enter it in the panel. For a persistent setup, choose **Environment variable** and enter the name of a variable available to the DSH Host process, such as `TIINY_API_KEY`.
4. Click **Find Pocket models** and select a model to fill in its exact **Model ID**. Click **Test connection**, then **Save connection** after the test passes.

**Custom System One** connects a workflow in DSH to any endpoint implementing the same request and response format. Enter the endpoint URL, Model ID and authentication in **Connections**. [Tiiny Text Classification (Jev) API](https://dev.tiiny.ai/#/inference-tiiny-sdk)

## Run a workflow

- **Order Inbox** includes four simulated parcel and order notifications. To reproduce the human review case, choose **Conflicting notices** and click **Run workflow**. The model can choose **Needs review** directly. The workflow also marks close calls for review if the two highest option probabilities are less than 12 percentage points apart and all option probabilities are available.
- **Message Review** shows a yes/no **Noul** decision. You can also define **Choice** questions with named options and **Score** questions with ordered levels.
- Use **Duplicate** to adapt an example. Use **Export workflow** and **Import JSON** to move a workflow to another DSH setup. The export contains its questions, rules, and examples.
- In **Runs**, select a sample by name and time. Inspect the original answer, final result and response JSON, or use **Rerun snapshot** to submit the saved input and configuration again.

If the endpoint reports that a model is loading or unavailable, open **Model Management** in TiinyOS, load the selected model, and test the connection again.

## DSH agent tool and local data

The `tiiny_decide` agent tool uses the same workflows, connections, and run history as the sidebar. For authenticated agent calls, use an environment-backed connection. Session keys entered in the panel apply to the current DSH session.

Configuration and runs are stored in the `tiiny-decide` folder under the active DSH profile, or in `~/.tiiny-decide/dsh` when the profile directory is unavailable. To override the location, set `TIINY_DECIDE_DSH_DATA_DIR` in the DSH Host environment to a dedicated directory.

## Development

Run `npm test` with Node.js 22 or later to check the DSH Host route, workflow and run persistence, Pocket model discovery, and review rules.
