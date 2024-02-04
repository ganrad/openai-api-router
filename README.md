# An Azure OpenAI Service *API Gateway*
This API gateway can be used to distribute requests to OpenAI API Service endpoints deployed on Azure.  This project describes the steps for deploying the API Gateway on Azure.

**Advantages/Benefits:**
1. The API Gateway uses Nodejs as the runtime.  Nodejs uses a single threaded event loop to asynchronously serve requests. It is built on Chrome V8 engine and extremely performant. The server can easily scale to handle 10's ... 1000's of concurrent requests simultaneously.
2. The API Gateway can be configured with multiple Azure OpenAI Service deployment URI's (a.k.a backend endpoints). When a backend endpoint is busy/throttled (returns http status code 429), the gateway will automatically switch to the next endpoint configured in its backend priority list.  In addition, the gateway will also keep track of throttled endpoints and will not direct any traffic to them until they are available again.
3. The Gateway can be easily configured with multiple backend endpoints using a JSON file.  Furthermore, the backend endpoints can be reconfigured at any time even when the server is running.  The gateway exposes a separate reconfig (/reconfig) endpoint that facilitates dynamic reconfiguration of backend endpoints.
4. The Gateway continously collects backend API metrics and exposes them thru the metrics (/metrics) endpoint.  Users can analyze the throughput and latency metrics and reconfigure the gateway's backend endpoint priority list to effectively route/shift the API workload to the desired backend endpoints based on available and consumed capacity.
5. Azure OpenAI model deployments can be easily swapped (eg., gpt-35 to gpt-4-8k) or updated without having to take down the API Gateway instance thereby limiting (or completely eliminating) application downtime.  

**Usage scenarios:**

The API Gateway can be used in two scenarios.
1. **Collecting Azure OpenAI API metrics**

   The API Gateway collects various backend API metrics based on configured time intervals.  These metrics can then be used to compute the required throughput (*Tokens per minute*) for a given OpenAI workload.  TPMs can be used to estimate *Provisioned Throughput Units*.

2. **Intelligently routing Azure OpenAI API requests**

   The API Gateway functions as an intelligent router and redirects OpenAI API traffic among multiple configured backend endpoints.  The gateway keeps track of unavailable/busy backend endpoints and automatically redirects traffic to available endpoints thereby distributing the API traffic load evenly and not overloading a given endpoint with too many requests.  

**Prerequisites:**
1.  An Azure **Resource Group** with **Owner** *Role* permission.  All Azure resources can be deloyed into this resource group.
2.  A **GitHub** Account to fork and clone this GitHub repository.
3.  Review [Overview of Azure Cloud Shell](https://docs.microsoft.com/en-us/azure/cloud-shell/overview).  **Azure Cloud Shell** is an interactive, browser accessible shell for managing Azure resources.  You will be using the Cloud Shell to create the Bastion Host (Linux VM).
4.  This project assumes readers are familiar with Linux fundamentals, Git SCM, Linux Containers (*docker engine*) and Kubernetes.  If you are new to any of these technologies, go thru the resources below.
    - [Learn Linux, 101: A roadmap for LPIC-1](https://developer.ibm.com/tutorials/l-lpic1-map/)

      Go thru the chapters in **Topic 103: GNU and UNIX commands**
    - [Introduction to Git SCM](https://git-scm.com/docs/gittutorial)
    - [Git SCM Docs](https://git-scm.com/book/en/v2)
    - [Docker Overview](https://docs.docker.com/engine/docker-overview/)
    - [Kubernetes Overview](https://kubernetes.io/docs/tutorials/kubernetes-basics/)
5.  (Windows users only) A **terminal emulator** is required to login (SSH) into the Linux VM on Azure. Download and install one of the utilities below.
    - [Putty](https://putty.org/)
    - [Git bash](https://gitforwindows.org/)
    - [Windows Sub-System for Linux](https://docs.microsoft.com/en-us/windows/wsl/install-win10)
9. (Optional) Download and install [Postman App](https://www.getpostman.com/apps), a REST API Client used for testing the API Gateway.

**Functional Architecture:**

![alt tag](./images/az-openai-api-gateway-ra.PNG)

Readers can refer to the following on-line resources as needed.
- [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli?view=azure-cli-latest)
- [Creating an Azure Linux VM](https://learn.microsoft.com/en-us/azure/virtual-machines/linux/quick-create-cli)
- [Docker](https://docs.docker.com/)
- [Azure OpenAI Service](https://learn.microsoft.com/en-us/azure/ai-services/openai/)
- [Azure Kubernetes Service](https://docs.microsoft.com/en-us/azure/aks/)
- [Azure Container Registry](https://docs.microsoft.com/en-us/azure/container-registry/)
- [Helm 3.x](https://docs.helm.sh/)

The sections below describe the steps to configure and deploy the API Gateway on Azure.  Although, there are multiple deployment options available on Azure, we will only describe the top two options recommended for production deployments.

1.  Containerize the API Gateway and deploy it on a standalone *Virtual machine*
2.  Containerize the API Gateway and deploy it on a container platform such as Kubernetes.  We will describe the steps for deploying the gateway container on *Azure Kubernetes Service*.

### A. Configure and run the API Gateway on a standalone *Virtual Machine*

Before we can get started, you will need a Linux Virtual Machine to run the API Gateway. If you haven't already, provision a Virtual Machine with a Linux flavor of your choice.

1. Clone or fork this GitHub repository into a directory on the VM.

   SSH login to the Virtual Machine using a terminal window. If you intend to customize the API Gateway, it's best to fork this repository into your GitHub account and then clone the repository to the VM.

2. Install Node.js.

   Refer to the installation instructions on [nodejs.org](https://nodejs.org/en/download/package-manager) for your specific Linux distribution.

3. Update the API Gateway endpoint configuration file.

   Review the `api-router-config.json` file and add/update the Azure OpenAI Service model deployment endpoints/URI's and corresponding API key values in this file. Save the file.

   **IMPORTANT**: The model deployment endpoints/URI's should be listed in increasing order of priority (top down) within the file. Endpoints listed at the top of the list will be assigned higher priority than those listed at the lower levels.  The API Gateway server will traverse and load the deployment URI's starting at the top in order of priority. While routing requests to OpenAI API backends, the gateway will strictly follow the priority order and route requests to endpoints with higher priority first before falling back to low priority endpoints. 

4. Set the gateway server environment variables.

   Set the environment variables to the correct values and export them before proceeding to the next step. Refer to the table below for descriptions of the environment variables.

   Env Variable Name | Description | Required | Default Value
   ----------------- | ----------- | -------- | ------------- 
   API_GATEWAY_KEY | API Gateway private key used for reconfiguring backend (Azure OpenAI) endpoints | Yes | Set this value to an alphanumeric string
   API_GATEWAY_CONFIG_FILE | The gateway configuration file location | Yes | Set the full or relative path to the gateway configuration file from the project root directory.
   API_GATEWAY_NAME | Gateway instance name | Yes | Set a value such as 'Instance-01' ...
   API_GATEWAY_PORT | Gateway server listen port | No | 8000
   API_GATEWAY_ENV | Gateway environment | Yes | Set a value such as 'dev', 'test', 'pre-prod', 'prod' ...
   API_GATEWAY_LOG_LEVEL | Gateway logging level | No | Default=info.  Possible values are debug, info, warn, error, fatal.
   API_GATEWAY_METRICS_CINTERVAL | Backend API metrics collection and aggregation interval (in minutes) | Yes | Set it to a numeric value eg., 60 (1 hour)
   API_GATEWAY_METRICS_CHISTORY | Backend API metrics collection history count | Yes | Set it to a numeric value (<= 600)  

   **NOTE**: You can update and run the shell script `./set-api-gtwy-env.sh` to set the environment variables.

5. Run the API Gateway server.

   Switch to the project root directory. Then issue the command shown in the command snippet below.

   ```bash
   # Use the node package manager (npm) to install the server dependencies
   $ npm install
   #
   # Start the API Gateway Server
   $ npm start
   #
   ```

   You will see the gateway server start up message in the terminal window as shown in the snippet below.

   ```bash
   > openai-api-router@1.0.0 start
   > node ./src/server.js

   Server(): OpenAI API Gateway server started successfully.
   Gateway uri: http://localhost:8000/api/v1/dev
   Server(): Backend/Target endpoints:
   uri: https://oai-gr-dev.openai.azure.com/openai/deployments/dev-gpt35-turbo-instruct/completions?api-version=2023-05-15
   uri: https://oai-gr-dev.openai.azure.com/openai/deployments/gpt-35-t-inst-01/completions?api-version=2023-05-15
   Server(): Loaded backend Azure OpenAI API endpoints
   ```

   Leave the terminal window open.

6. Retrieve the API Gateway Server info (/instanceinfo)

   Use a web browser to access the API Gateway Server *instanceinfo* endpoint. Specify correct values for the gateway listen port and environment. See below.

   http://localhost:{API_GATEWAY_PORT}/api/v1/{API_GATEWAY_ENV}/apirouter/instanceinfo

   If you get a json response similar to the one shown in the snippet below then the server is ready to accept Azure OpenAI service requests.

   ```json
   {
     "serverName": "Gateway-Instance-01",
     "serverVersion": "1.0.0",
     "envVars": {
        "apiGatewayHost": "localhost",
        "apiGatewayListenPort": 8000,
        "apiGatewayEnv": "dev",
        "apiGatewayCollectInterval": 5,
        "apiGatewayCollectHistoryCount": 5,
        "apiGatewayConfigFile": "./api-router-config-test.json"
     },
     "k8sInfo": {},
     "nodejs": {
        "node": "20.11.0",
        "acorn": "8.11.2",
        "ada": "2.7.4",
        "ares": "1.20.1",
        "base64": "0.5.1",
        "brotli": "1.0.9",
        "cjs_module_lexer": "1.2.2",
        "cldr": "43.1",
        "icu": "73.2",
        "llhttp": "8.1.1",
        "modules": "115",
        "napi": "9",
        "nghttp2": "1.58.0",
        "nghttp3": "0.7.0",
        "ngtcp2": "0.8.1",
        "openssl": "3.0.12+quic",
        "simdutf": "4.0.4",
        "tz": "2023c",
        "undici": "5.27.2",
        "unicode": "15.0",
        "uv": "1.46.0",
        "uvwasi": "0.0.19",
        "v8": "11.3.244.8-node.17",
        "zlib": "1.2.13.1-motley-5daffc7"
     },
     "oaiEndpoints": {
        "0": "https://oai-gr-dev.openai.azure.com/openai/deployments/dev-gpt35-turbo-instruct/completions?api-version=2023-05-15",
        "1": "https://oai-gr-dev.openai.azure.com/openai/deployments/gpt-35-t-inst-01/completions?api-version=2023-05-15"
     },
     "apiGatewayUri": "/api/v1/dev/apirouter",
     "endpointUri": "/api/v1/dev/apirouter/instanceinfo",
     "serverStartDate": "2/4/2024, 4:43:39 AM",
     "status": "OK"
   }  
   ```

7. Access the API Gateway Server load balancer/router (/lb) endpoint

   Use **Curl** or **Postman** to send a few completion / chat completion API requests to the gateway server *load balancer* (/lb) endpoint.  See URL below.

   http://localhost:{API_GATEWAY_PORT}/api/v1/{API_GATEWAY_ENV/apirouter/lb

   Review the OpenAI API response and log lines output by the gateway server in the respective terminal windows.

   **NOTE**: You can update and use the shell script `./tests/test-oai-api-gateway.sh` with sample data to test how the API Gateway intelligently distributes the OpenAI API requests among multiple configured backend endpoints.

### B. Containerize the API Gateway and deploy it on the Virtual Machine

Before getting started with this section, make sure you have installed a container runtime such as `docker` or `containerd` on the Linux VM. For installing docker engine, refer to the docs [here](https://docs.docker.com/engine/install/).

1. Build the API Gateway container image.

   Review the container image build script `./Dockerfile`.  Make any required updates to the environment variables.  The environment variables can also be passed to the docker engine at build time.  To do this, you can modify the provided container build script `./scripts/build-container.sh`.  After making the updates to this build shell script, run the script to build the API Gateway container image.  See command snippet below.

   ```bash
   # Run the container image build
   $ ./scripts/build-container.sh
   #
   # List the container images.  This command should list the images on the system.
   $ docker images
   #
   ```

2. Run the containerized API Gateway server instance.

   Run the API Gateway container instance using the provided `./scripts/start-container.sh` shell script.  Refer to the command snippet below.

   ```bash
   # Run the API Gateway container instance
   $ ./scripts/start-container.sh
   #
   # Leave this terminal window open
   ```

3. Access the API Gateway Server load balancer/router (/lb) endpoint

   Use **Curl** or **Postman** to send a few completion / chat completion API requests to the gateway server *load balancer* (/lb) endpoint.  See URL below.

   http://localhost:{API_GATEWAY_PORT}/api/v1/{API_GATEWAY_ENV/apirouter/lb

   Review the OpenAI API response and log lines output by the gateway server in the respective terminal windows.

   **NOTE**: You can update and use the shell script `./tests/test-oai-api-gateway.sh` with sample data to test how the API Gateway intelligently distributes the OpenAI API requests among multiple configured backend endpoints.

### C. Analyze Azure OpenAI endpoint(s) traffic metrics

1. Access the API Gateway metrics (/metrics) endpoint and analyze OpenAI API metrics.

   Use a web browser and access the API Gateway metrics URL to retrieve the backend OpenAI API metrics information.  The metrics URL is provided below.

   http://localhost:{API_GATEWAY_PORT}/api/v1/{API_GATEWAY_ENV/apirouter/metrics
    
   A sample Json output snippet is pasted below.

   ```json
   {
     "listenPort": "8000",
     "instanceName": "Gateway-Instance-01",
     "endpoint": "/metrics",
     "collectionInterval": "5",
     "historyCount": "5",
     "endpointMetrics": [
        {
            "endpoint": "https://oai-gr-dev.openai.azure.com/openai/deployments/dev-gpt35-turbo-instruct/completions?api-version=2023-05-15",
            "priority": 1,
            "metrics": {
                "apiCalls": 39,
                "failedCalls": 3,
                "totalCalls": 42,
                "kInferenceTokens": 16.913,
                "history": {
                    "0": {
                        "collectionTime": "2/2/2024, 9:24:25 PM",
                        "collectedMetrics": {
                            "noOfApiCalls": 50,
                            "noOfFailedCalls": 7,
                            "throughput": {
                                "kTokensPerWindow": 20.499,
                                "requestsPerWindow": 122.994,
                                "avgTokensPerCall": 409.98,
                                "avgRequestsPerCall": 2.45988
                            },
                            "latency": {
                                "avgResponseTimeMsec": 3024.9
                            }
                        }
                    }
                }
            }
        },
        {
            "endpoint": "https://oai-gr-dev.openai.azure.com/openai/deployments/gpt-35-t-inst-01/completions?api-version=2023-05-15",
            "priority": 2,
            "metrics": {
                "apiCalls": 18,
                "failedCalls": 9,
                "totalCalls": 27,
                "kInferenceTokens": 8.129,
                "history": {
                    "0": {
                        "collectionTime": "2/2/2024, 9:24:57 PM",
                        "collectedMetrics": {
                            "noOfApiCalls": 30,
                            "noOfFailedCalls": 16,
                            "throughput": {
                                "kTokensPerWindow": 12.582,
                                "requestsPerWindow": 75.492,
                                "avgTokensPerCall": 419.4,
                                "avgRequestsPerCall": 2.5163999999999995
                            },
                            "latency": {
                                "avgResponseTimeMsec": 3628.633333333333
                            }
                        }
                    }
                }
            }
        }
     ],
     "successApiCalls": 138,
     "failedApiCalls": 423,
     "totalApiCalls": 561,
     "currentDate": "2/2/2024, 9:33:16 PM",
     "status": "OK"
   }
   ```

   Description of API Gateway server instance metrics are provided in the table below.

   Metric name | Description
   ----------- | -----------
   successApiCalls | Number of backend API calls successfully handled by the API Gateway.
   failedApiCalls | Number of backend API calls which couldn't be completed. Reason here could be that all backend endpoints were busy/throttled.
   totalApiCalls | Total number of backend API calls received by this API Gateway Server instance.

   Description of backend endpoint metrics are provided in the table below.

   Metric name | Description
   ----------- | -----------
   apiCalls | Number of OpenAI API calls successfully handled by this backend endpoint in the current metrics collection interval
   failedCalls | Number of OpenAI API calls which this backend endpoint couldn't handle (failed) in the current metrics collection interval
   totalCalls | Total number of OpenAI API calls received by this backend endpoint in the current metrics collection interval
   kInferenceTokens | Total tokens (K) processed/handled by this backend OpenAI endpoint in the current metrics collection interval

   Description of backend endpoint history metrics are provided in the table below.

   Metric name | Description
   ----------- | -----------
   collectionTime | Start time of metrics collection interval/window
   noOfApiCalls | Number of OpenAI API calls successfully handled by this backend (/endpoint)
   noOfFailedCalls | Number of OpenAI API calls which this backend endpoint couldn't handle (failed) 
   throughput.kTokensPerWindow | Total tokens (K) processed/handled by this OpenAI backend 
   throughput.requestsPerWindow | Total number of requests processed/handled by this OpenAI endpoint 
   throughput.avgTokensPerCall | Average tokens (K) processed by this OpenAI backend per API call
   throughput.avgRequestsPerCall | Average requests processed by this OpenAI backend per API call
   latency.avgResponseTimeMsec | Average response time of OpenAI backend API call

### D. Reload the API Gateway backend endpoints (Configuration)

The API Gateway endpoint configuration can be easily updated even when the server is running. There are just two simple steps.

1. Update the API Gateway endpoint configuration file.

   Open the API Gateway endpoint configuration json file (`api-router-config.json`) and update the OpenAI endpoints as needed.  Save this file.

2. Reload the API Gateway endpoint configuration.

   Supply the private key configured with the API Gateway.  Use **Curl** command in a terminal window or a web browser to access the gateway reconfiguration endpoint.  See URL below.

   http://localhost:{API_GATEWAY_PORT}/api/v1/{API_GATEWAY_ENV/apirouter/reconfig/{API_GATEWAY_KEY}

**IMPORTANT**: A side effect of reconfiguring the API Gateway endpoints is that all current and historical metric values collected and cached by the server will be reset. Hence, if you want to retain metrics history, you should save the metrics (/metrics) endpoint output prior to reloading the updated OpenAI endpoints from the configuration file.

### E. Deploy the API Gateway on *Azure Kubernetes Service*

Before proceeding with this section, make sure you have installed the following services on Azure.
- An *Azure Container Registry* (ACR) instance
- An *Azure Kubernetes Cluster* (AKS) instance

The following command line tools should be installed on the Linux VM.
- Azure CLI
- Kubernetes CLI (`kubectl`)
- Helm CLI

Additionally, a Kubernetes ingress controller (**Ngnix**) should also be deployed and running on the AKS / Kubernetes cluster.

1. Push the API Gateway container image into ACR.

   Refer the script snippet below to push the API Gateway container image into ACR.  Remember to substitute ACR name with the name of your container registry.

   ```bash
   # Login to the ACR instance. Substitute the correct name of your ACR instance.
   $ az acr login --name [acr-name].azurecr.io
   #
   # Tag the container image so we can push it to ACR repo.
   $ docker tag az-oai-api-gateway [acr-name].azurecr.io/az-oai-api-gateway:v1.020224
   # 
   # List container images on your VM
   $ docker images
   #
   # Push the API Gateway container image to ACR repo.
   $ docker push [acr-name].azurecr.io/az-oai-api-gateway:v1.020224
   #
   ```

   Use Azure portal to verify the API Gateway container image was stored in the respective repository (`az-oai-api-gateway`).

2. Deploy the Azure OpenAI API endpoints configuration.

   Review the *Config Map* resource `./k8s-resources/apigateway-cm.yaml` file and update the backend Azure OpenAI endpoints along with corresponding API keys.  This Config Map resource will be mounted into the API Gateway container.
