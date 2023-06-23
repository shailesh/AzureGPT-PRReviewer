# AzureGPT-PRReviewer

AzureGPT-PRReviewer is a powerful plugin for Azure DevOps that integrates OpenAI GPT (Generative Pre-trained Transformer) model as a Pull Request (PR) reviewer. This plugin automates the PR review process by leveraging the advanced natural language processing capabilities of GPT, providing intelligent code review feedback and assisting developers and reviewers in ensuring code quality and best practices.

## Installation

You can easily install AzureGPT-PRReviewer from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/manage/publishers/azuregpt-prreviewer).

## Usage

To incorporate AzureGPT-PRReviewer into your build pipelines, simply add the necessary tasks to your build definition. The plugin will automatically analyze and review the code changes in your PRs using the OpenAI GPT model.

## Setup

Before using this plugin, it is important to grant necessary permissions to the build service agent to contribute to pull requests in your repository. Follow these steps to ensure the setup is properly configured:

1. Grant permission to the build service agent:
   - Ensure that the build service has the necessary permissions to contribute to pull requests in your repository. This can typically be configured through repository settings or access control.
   - You can refer to the screenshot below as an example:
   
     ![contribute_to_pr](https://github.com/shailesh/AzureGPT-PRReviewer/blob/main/images/contribute_to_pr.png?raw=true)

2. Allow the plugin to access the system token:
   - For YAML pipelines, add a checkout section with persistCredentials set to true in your pipeline configuration:
   
     ```yaml
     steps:
     - checkout: self
       persistCredentials: true
     ```
     
   - For Classic editors, enable the option "Allow scripts to access the OAuth token" in the "Agent job" properties.
   
     ![allow_access_token](https://github.com/shailesh/AzureGPT-PRReviewer/blob/main/images/allow_access_token.png?raw=true)

## Contributions

We welcome contributions from the community! If you have discovered a bug, made improvements, or have any valuable suggestions, please feel free to submit a pull request targeting the `main` branch. You can also report any issues or feature requests on [GitHub](https://github.com/shailesh/AzureGPT-PRReviewer/issues) for further discussion and collaboration.

## License

This project is licensed under the [MIT License](https://github.com/shailesh/AzureGPT-PRReviewer/main/LICENSE).
