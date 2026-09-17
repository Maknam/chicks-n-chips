# Database design

All operational entities use UUIDs and restaurant/branch scope. Human-readable order numbers are allocated inside branch transactions. Monetary amounts are integer GHS pesewas. Dates are UTC ISO timestamps; business-day calculations use Africa/Accra (UTC).

Core entities: restaurants, branches, users, staff_roles, customers, categories, products, product_variants, option_groups, product_options, orders, order_items, order_item_options, payments, pickup_slots, inventory_items, product_ingredients, stock_movements, waste_records, notifications and audit_logs.

Runtime records retain a typed JSON document alongside relational identity/scope columns. Child order items, options, recipes and movements are materialized transactionally for reporting. A branch revision guards atomic read-modify-write commits, including capacity checks and payment idempotency. This is a deliberately small-vendor design; move high-volume writes into dedicated SQL commands before scaling beyond pilot traffic.

RLS denies anonymous operational access. Staff policies use auth.uid() membership and branch scope. Only the backend service role may invoke commit functions. A separate branch revision table contains no customer data and permits authenticated branch members to receive realtime change signals. Public guests read only server-filtered menu/slot data and capability-protected receipts.

Demo data is fictional. Never seed production with sample customers or orders. Back up PostgreSQL daily, enable point-in-time recovery when available, and rehearse restore into a separate project. Agree retention periods for phones and receipts before the pilot; delete/anonymize customer data without losing aggregate business metrics.
