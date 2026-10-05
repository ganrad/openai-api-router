#!/bin/bash

#Script to create custom filters
grn=$'\e[1;32m'
end=$'\e[0m'

set -e

# Source information from variables.env
# source variables.env
sub_id=9f5e844e-0f49-47bf-9e4a-4acaed3fe9bf
resourcegroup=dev-ais-wus3
openai_name=ganes-mbjvew83-eastus2
custom_filter=content-filter-cp-api-test
# empty_filter=$EMPTY_CUSTOM_FILTER

az account set -s $sub_id

printf "${grn}Starting to create filters...${end}\n"

printf "${grn}Creating a custom filter...${end}\n"
deployment_result=$(az rest --method PUT \
  --uri "https://management.azure.com/subscriptions/$sub_id/resourceGroups/$resourcegroup/providers/Microsoft.CognitiveServices/accounts/$openai_name/raiPolicies/$custom_filter?api-version=2024-10-01" \
  --body '{
    "properties": {
      "mode": "Default",
      "basePolicyName": "Microsoft.Default",
      "contentFilters": [
        { "name": "Hate",
          "blocking": true,
          "enabled": true,
          "severityThreshold": "Low",
          "source": "Prompt"
        },
        { "name": "Violence",
          "blocking": true,
          "enabled": true,
          "severityThreshold": "Low",
          "source": "Prompt"
        },
        { "name": "Sexual",
          "blocking": true,
          "enabled": true,
          "severityThreshold": "Low",
          "source": "Prompt"
        },
        { "name": "Selfharm",
          "blocking": true,
          "enabled": true,
          "severityThreshold": "Low",
          "source": "Prompt"
        },
        { "name": "Hate",
          "blocking": true,
          "enabled": true,
          "severityThreshold": "Low",
          "source": "Completion"
        },
        { "name": "Violence",
          "blocking": true,
          "enabled": true,
          "severityThreshold": "Low",
          "source": "Completion"
        },
        { "name": "Sexual",
          "blocking": true,
          "enabled": true,
          "severityThreshold": "Low",
          "source": "Completion"
        },
        { "name": "Selfharm",
          "blocking": true,
          "enabled": true,
          "severityThreshold": "Low",
          "source": "Completion"
        }
      ]
    }
  }'
)

printf "${grn}Successfully created the resource.  Check in AI Foundry ...${end}\n"