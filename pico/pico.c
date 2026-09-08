#include <stdio.h>
#include "pico/stdlib.h"
#include "pico/stdio_usb.h"

// Stream 32 samples every millisecond: set the webapp sample rate to 32000.
#define SAMPLE_RATE_HZ 32000u
#define SAMPLES_PER_BLOCK 32u
#define FREQUENCY_HOLD_US 5000000ull

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
    static const uint32_t frequencies_hz[] = {100, 500, 1000};
    uint32_t phase = 0;
    size_t frequency_index = 0;
    uint64_t next_frequency_change = time_us_64() + FREQUENCY_HOLD_US;
    uint64_t next_block = time_us_64();

    while (true)
    {
        if (!stdio_usb_connected())
        {
            // Restart the sequence when the viewer reconnects.
            while (!stdio_usb_connected())
                sleep_ms(10);
            phase = 0;
            frequency_index = 0;
            next_block = time_us_64();
            next_frequency_change = next_block + FREQUENCY_HOLD_US;
        }

        const uint64_t now = time_us_64();
        while (now >= next_frequency_change)
        {
            frequency_index = (frequency_index + 1) %
                              (sizeof(frequencies_hz) / sizeof(frequencies_hz[0]));
            next_frequency_change += FREQUENCY_HOLD_US;
        }

        // A fixed sample rate keeps frequency measurements meaningful. Changing
        // the phase increment changes frequency without resetting the waveform.
        for (uint32_t i = 0; i < SAMPLES_PER_BLOCK; ++i)
        {
            putchar_raw(sine_wave[phase * sizeof(sine_wave) / SAMPLE_RATE_HZ]);
            phase = (phase + frequencies_hz[frequency_index]) % SAMPLE_RATE_HZ;
        }
        stdio_flush();

        next_block += 1000;
        // Avoid a burst of catch-up samples if the USB host stalls.
        if (time_us_64() > next_block)
            next_block = time_us_64();
        sleep_until(from_us_since_boot(next_block));
    }
}
