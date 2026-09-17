"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="tracking">
      <h1>Something interrupted your order.</h1>
      <p>
        Your saved cart is still on this device. If you already placed an order,
        check My orders before trying again.
      </p>
      <button className="primary" onClick={reset}>
        Try again
      </button>
      <p>
        <a href="/orders">My orders</a>
      </p>
    </main>
  );
}
