## Reporting modes

Here are notes about the challenge of implementing the new reporting modes of CMCD-v2.

### Response Mode

- Modified the `_updateRequestUrlAndHeadersWithCMCD` function to save the cmcdHeaders or `cmcdParams` in `customData` so they can be sent to the remote server in the `_onRequestEnd` function.

- Observations:
    - The mode that already exists in the configuration for the "transmition mode" might be confusing with the new mode for the "reporting mode".