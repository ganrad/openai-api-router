# An Azure OpenAI Service *API Gateway*
This API gateway can be used to distribute requests to OpenAI API Service endpoints deployed on Azure.  This project describes the steps for deploying the API Gateway on Azure.

**Advantages/Benefits:**
1. The API Gateway uses Nodejs as the runtime.  Nodejs uses a single threaded event loop to asynchronously serve requests. It is built on Chrome V8 engine and extremely performant. The server can easily scale to handle 10's ... 1000's of concurrent requests simultaneously.
2. The API Gateway can be configured with multiple Azure OpenAI Service deployment URI's (a.k.a backend endpoints). When a backend endpoint is busy/throttled (returns http status code 429), the gateway will automatically switch to the next endpoint configured in its backend priority list.  In addition, the gateway will also keep track of throttled endpoints and will not direct any traffic to them until they are available again.
3. The Gateway can be easily configured with multiple backend endpoints using a JSON file.  Furthermore, the backend endpoints can be reconfigured at any time even when the server is running.  The gateway exposes a separate reconfig (/reconfig) endpoint that facilitates dynamic reconfiguration of backend endpoints.
4. The Gateway continously collects backend API metrics and exposes them thru the metrics (/metrics) endpoint.  Users can analyze the throughput and latency metrics and reconfigure the gateway's backend endpoint priority list to effectively route/shift the API workload to the desired backend endpoints based on available and consumed capacity.

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
4.  This project assumes readers/attendees are familiar with Linux fundamentals, Git SCM, Linux Containers (*docker engine*) and Kubernetes.  If you are new to any of these technologies, go thru the resources below.
    - [Learn Linux, 101: A roadmap for LPIC-1](https://developer.ibm.com/tutorials/l-lpic1-map/)

      Go thru the chapters in **Topic 103: GNU and UNIX commands**
    - [Introduction to Git SCM](https://git-scm.com/docs/gittutorial)
    - [Git SCM Docs](https://git-scm.com/book/en/v2)
    - [Docker Overview](https://docs.docker.com/engine/docker-overview/)
    - [Kubernetes Overview](https://kubernetes.io/docs/tutorials/kubernetes-basics/)
5.  (Windows users only) A **terminal emulator** is required to login (SSH) into the Linux VM (Bastion) host running on Azure. Download and install one of the utilities below.
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

The sections below describe the steps to configure and deploy the API Gateway on Azure.  Although, there are multiple deployment options available on Azure, we will describe the top two suggested for production deployments.

1.  Run the API Gateway on a standalone *Virtual machine*
2.  Containerize the API Gateway and deploy it on a container platform such as Kubernetes.  We will describe the steps for deploying the gateway container on *Azure Kubernetes Service*.

### A. Run the API Gateway on a standalone *Virtual Machine*

**NOTE**: Before we can get started, you will need a Linux Virtual Machine to run the API Gateway. If you haven't already, provision a Virtual Machine with a Linux flavor of your choice.

1. Clone or fork this GitHub repository into a directory on the VM.

   SSH login to the Virtual Machine using a terminal window. If you intend to customize the API Gateway, it's best to fork this repository into your GitHub account and then clone the repository to the VM.

2. Install Node.js.

   Refer to the installation instructions on [nodejs.org](https://nodejs.org/en/download/package-manager) for your specific Linux distribution.

3. Update the API Gateway configuration file.

   Review the `api-router-config.json` file and add/update the Azure OpenAI Service model deployment endpoints/URI's and corresponding API key values in this file. Save the file.

   **IMPORTANT**: The model deployment endpoints/URI's should be listed in increasing order of priority (top down) within the file. Endpoints listed at the top of the list will be assigned higher priority than those listed at the lower levels.  The API Gateway server will traverse and load the deployment URI's starting at the top in order of priority. While routing requests to API backends, the gateway will strictly follow the priority order and route requests to endpoints with higher priority first before falling back to low priority endpoints. 

4. Set the gateway server environment variables.

   Set the environment variables to the correct values and export them before proceeding to the next step. Refer to the table below for descriptions of the environment variables.

   Env Variable Name | Description | Required | Default Value
   ----------------- | ----------- | -------- | -------------
   API_GATEWAY_CONFIG_FILE | The gateway configuration file location | Yes | Set the full or relative path to the gateway configuration file from the project root directory.
   API_GATEWAY_NAME | Gateway instance name | Yes | Set a value such as 'Instance-01' ...
   API_GATEWAY_PORT | Gateway server listen port | No | 8000
   API_GATEWAY_ENV | Gateway environment | Yes | Set a value such as 'dev', 'test', 'pre-prod', 'prod' ...
   API_GATEWAY_LOG_LEVEL | Gateway logging level | No | Default=info.  Possible values are debug, info, warn, error, fatal.
   API_GATEWAY_METRICS_CINTERVAL | Backend API metrics collection and aggregation interval (in minutes) | Yes | Set it to a numeric value eg., 60 (1 hour)
   API_GATEWAY_METRICS_CHISTORY | Backend API metrics collection history count | Yes | Set it to a numberic value (<= 600)  

5. Run the API Gateway server.

   Switch to the project root directory. Then issue the command shown in the shell snippet below.

   ```
   # Use the node package manager (npm) to install the server dependencies
   $ npm install
   #
   # Start the API Gateway Server
   $ npm start
   #
   ```

   Leave the terminal window open.

6. Access the API Gateway Server URI

   Use a web browser to access the API Gateway Server *health* endpoint. Specify correct values for the gateway listen port and environment. See below.

   http://localhost:{API_GATEWAY_PORT}/api/v1/{API_GATEWAY_ENV}/apirouter/healthz

   If you get a json response similar to the one shown in the snippet below then the server is ready to accept OpenAI service requests.

   Use **Curl** or **Postman** to send a few completion / chat completion API requests to the gateway server endpoint.  Review the response and log lines output by the gateway server in the terminal window.
