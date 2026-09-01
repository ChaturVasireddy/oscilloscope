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

    uint8_t value = 0;

    while (true)
    {
        putchar_raw(value);

        value = (value == 0) ? 255 : 0;
    }
}