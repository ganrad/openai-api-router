---
name: inventory-mgmt-mcp-server
description: Query and adjust warehouse stock levels, reservations, and replenishment orders across distribution centers. Use when the user asks about inventory counts, stock availability, backorders, safety stock, or moving units between warehouses.
license: Proprietary
metadata:
  rapid.owner: supply-chain-platform
  rapid.index-version: "1"
---

# Inventory Management

Retrieval-only notes for skill authors. Nothing in this file is sent to the planner
prompt; it exists solely to build the tool retrieval index.

## Tools

```yaml
tools:
  - name: lookup_sku
    description: >
      Resolves a product name, partial description, or UPC barcode to a canonical SKU
      identifier. Prerequisite for most other inventory tools. Use whenever the user
      refers to a product by name rather than by SKU number.
    tags: [inventory, read, lookup, utility]
    aliases: [find product, product code, item number, barcode, UPC, resolve sku]
    examples:
      - "what is the sku for the blue widget"
      - "look up the item number for a 12 inch drive belt"
    alwaysInclude: true

  - name: get_stock_level
    description: >
      Returns on-hand, reserved, and available-to-promise quantities for a SKU at one
      warehouse or across all warehouses. Use for availability checks and questions
      about how much inventory exists.
    tags: [inventory, read, stock, availability]
    aliases: [on hand, ATP, available to promise, how many, quantity, count, in stock]
    examples:
      - "how many units of SKU 88213 are left in DC07"
      - "do we have the blue widget in stock anywhere"
      - "what is available to promise for 44120"

  - name: reserve_stock
    description: >
      Places a soft reservation on a quantity of a SKU at a warehouse for a specific
      order. Use when committing inventory to an order or holding units for a customer.
    tags: [inventory, write, reservation]
    aliases: [hold, allocate, commit units, set aside]
    examples:
      - "hold 40 units of 88213 for order 5591"
      - "allocate 12 drive belts to the Contoso order"
    destructive: true

  - name: release_reservation
    description: >
      Cancels an existing soft reservation and returns the units to available stock.
      Use when an order is cancelled or a hold has expired.
    tags: [inventory, write, reservation]
    aliases: [cancel hold, unallocate, free up stock]
    examples:
      - "release the hold on order 5591"
    destructive: true

  - name: transfer_stock
    description: >
      Creates an inter-warehouse transfer order moving a quantity of a SKU from a
      source distribution center to a destination. Use when balancing stock between
      warehouses or fulfilling from an alternate location.
    tags: [inventory, write, transfer, logistics]
    aliases: [move units, ship between warehouses, rebalance, interwarehouse]
    examples:
      - "move 200 units of 88213 from DC07 to DC02"
      - "rebalance stock from the east coast warehouse"
    destructive: true

  - name: get_replenishment_plan
    description: >
      Returns the current replenishment and reorder plan for a SKU, including reorder
      point, safety stock level, projected stockout date, and open purchase orders.
      Use when the user asks when stock will run out, about reorder thresholds, or
      about incoming supply.
    tags: [inventory, read, planning, forecast]
    aliases: [reorder point, safety stock, when will we run out, stockout, purchase orders]
    examples:
      - "when are we going to run out of 88213"
      - "what is the safety stock level for the blue widget"
      - "show open purchase orders for drive belts"

  - name: list_backorders
    description: >
      Lists open backorders, optionally filtered by SKU, warehouse, customer, or age.
      Use for questions about unfulfilled demand and orders waiting on stock.
    tags: [inventory, read, orders, backorder]
    aliases: [unfulfilled, waiting on stock, pending orders, oversold]
    examples:
      - "what backorders do we have for DC07"
      - "show me everything oversold this week"
```