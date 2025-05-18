# UNIT MINI PDM

In the manifest file, each device is configured with pin asgins for connection to PORT A. For details and pin assignments for other ports, please refer to the [linked page](https://docs.m5stack.com/en/unit/pdm).

| Moddable | UNIT   |
| -------- | ------ |
| datain   | DAT    |
| bck_pin  | unused |
| lr_pin   | CLK    |

## inclide manifest

To use this driver, you need to add the following to the include section of the manifest file.

```jsonc
{
  "include": [
    // ...
    {
      "git": "https://github.com/stc1988/moddable-labs.git",
      "manifest": "./modules/drivers/unit_mini_pdm/manifest.json"
    }
  ]
}
```
