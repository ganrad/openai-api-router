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

**Important Notes:**
- This project describes the steps for configuring and deploying the API Gateway in 1) Standalone *Virtual machine* on Azure and 2) Containerized server deployed on *Azure Kubernetes Service*.

