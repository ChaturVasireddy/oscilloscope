#include <stdio.h>
#include "pico/stdlib.h"
#include "pico/stdio_usb.h"

int main()
{
    stdio_init_all();

    // Wait for USB connection
    while (!stdio_usb_connected())
    {
        sleep_ms(10);
    }

    static const uint8_t sine_wave[] = {
        128, 153, 177, 199, 218, 234, 245, 252,
        255, 252, 245, 234, 218, 199, 177, 153,
        128, 103,  79,  57,  38,  22,  11,   4,
          1,   4,  11,  22,  38,  57,  79, 103
    };
    uint8_t sample = 0;

    while (true)
    {
        putchar_raw(sine_wave[sample]);
        sample = (sample + 1) % sizeof(sine_wave);
    }
}