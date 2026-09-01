#include <stdio.h>
#include "pico/stdlib.h"

#include "dshot.h"

int main (){
    dshot_actuator meow = {.pin = 2};
    dshot_init(&meow);
    dshot_arm(&meow);
    
    dshot_actuator meow = {.pin = 2};
    dshot_init(&meow);
    dshot_arm(&meow);


    thrust(&T1, 1000);
    thrust(&T2, 1000);
}