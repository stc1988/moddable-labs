# ATOMIC ECHO BASE

Each device is configured in the manifest file For details and pin assignments for other ports, please refer to the [linked page](https://docs.m5stack.com/en/atom/Atomic%20Echo%20Base).

| Moddable    | ATOMIC ECHO BASE |
| ----------- | ---------------- |
| dataout_pin | DSDIN            |
| lr_pin      | LRCK             |
| datain      | ASDOUT           |
| bck_pin     | SCLK             |
| sda         | SCL              |
| sclz        | SDA              |

## inclide manifest

To use this driver, you need to add the following to the include section of the manifest file.

```jsonc
{
  "include": [
    // ...
    {
      "git": "https://github.com/stc1988/moddable-labs.git",
      "manifest": "./modules/drivers/atomic_echo_base/manifest.json"
    }
  ]
}
```
