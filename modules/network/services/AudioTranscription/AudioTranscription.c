#include "mc.xs.h"
#include "math.h"

mxImport xsIntegerValue _xsmcGetBuffer(xsMachine *the, xsSlot *slot, void **data, xsUnsignedValue *count, xsBooleanValue writable);

void xs_computeLevel(xsMachine *the)
{
	uint8_t* buffer;
	xsUnsignedValue size, i;
	int16_t* samples;
	double average = 0.0;
	int32_t	result;

	_xsmcGetBuffer(the, &(xsArg(0)), (void**)&buffer, &size, 0);
	size >>= 1;
	samples = (int16_t*)buffer;
	for (i = 0; i < size; i++) {
		int16_t sample = samples[i];
		if (sample < 0) 
			average -= sample;
		else
			average += sample;
	}
	average /= size;
	result = round(average);
	xsResult = xsInteger(result);
}