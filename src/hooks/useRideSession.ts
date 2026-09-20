import { useSyncExternalStore } from 'react';

import { getRideState, subscribeRide, type RideState } from '@/services/rideSession';

export function useRideSession(): RideState {
  return useSyncExternalStore(subscribeRide, getRideState, getRideState);
}

export default useRideSession;
