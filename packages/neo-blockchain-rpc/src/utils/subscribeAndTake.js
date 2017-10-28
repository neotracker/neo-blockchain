/* @flow */
import type { Observable } from 'rxjs/Observable';
import type { Subscription } from 'rxjs/Subscription';

type Result<Out> = {|
  subscription: Subscription,
  out: Out,
|};
export default async function<In, Out>({
  observable,
  next,
}: {|
  observable: Observable<In>,
  next: (value: In) => Out,
|}): Promise<Result<Out>> {
  let out;
  const subscription = observable.subscribe({
    next: (value: In) => {
      out = next(value);
    },
  });
  if (out == null) {
    const value = await observable.take(1).toPromise();
    out = next(value);
  }

  return { subscription, out };
}
