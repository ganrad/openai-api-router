---
name: electronics-scm-mcp-server
description: Plan demand, manage inventory, source from suppliers, schedule production, and move freight for an electronics manufacturer. Use when the user asks about forecasts, stock levels, safety stock, bills of materials, supplier performance or risk, purchase orders, RFQs, work orders, plant capacity, quality inspections and failed lots, shipments, carriers, customs, landed cost, warehouse capacity, or supply chain disruption and KPI analysis.
---

## Tools

```yaml
tools:
  # ---------------------------------------------------------------- planning
  - name: forecast_demand
    description:
      Produces a statistical demand forecast for a SKU at a site over a horizon in weeks,
      with per-week point estimates plus P10 and P90 bounds. Use for forward-looking demand
      questions and before committing capacity or buying material.
    tags: [planning, read, forecast, demand]
    aliases: [demand forecast, projected demand, how much will we sell, future demand, predicted volume, demand plan]
    examples:
      - "what is the demand forecast for SKU-4821 in Dallas"
      - "project demand for the next 12 weeks at DC-ATL-01"

  - name: get_demand_history
    description:
      Returns historical ordered versus shipped demand for a SKU by week, with fill rate
      and coefficient of variation. Use to understand past demand patterns, volatility, or
      how often we failed to ship what was ordered.
    tags: [planning, read, demand, history]
    aliases: [past demand, historical sales, demand pattern, shipped history, order history, demand variability]
    examples:
      - "show me 12 weeks of demand history for SKU-4821"
      - "how volatile has demand been for this part"

  - name: adjust_forecast
    description:
      Applies a planner override to a SKU forecast as a percentage uplift or reduction,
      producing a new forecast version. Use when the user wants to manually change a
      forecast for a known event the statistical model cannot see.
    tags: [planning, write, forecast, override]
    aliases: [override forecast, bump forecast, increase forecast, reduce forecast, manual adjustment, forecast version]
    examples:
      - "increase the forecast for SKU-4821 by 20 percent for the promo"
      - "cut the demand plan 15 percent, the deal slipped"

  - name: get_forecast_accuracy
    description:
      Reports MAPE, weighted APE, signed bias, and a letter grade for recent forecast
      cycles, for one SKU or the whole portfolio. Use to judge whether the demand plan can
      be trusted before acting on it.
    tags: [planning, read, forecast, accuracy, metrics]
    aliases: [MAPE, forecast error, forecast bias, how accurate is the forecast, planning accuracy, WAPE]
    examples:
      - "how accurate has our forecasting been in NA this quarter"
      - "what is the MAPE for SKU-4821"

  - name: run_sop_scenario
    description:
      Runs a sales and operations planning what-if across supply, capacity, and cost,
      returning projected service level, inventory turns, gross margin, and any capacity
      gap. Use for demand-up or capacity-down scenario questions ahead of an S&OP cycle.
    tags: [planning, write, scenario, sop, simulation]
    aliases: [what if, scenario planning, S&OP, sales and operations planning, capacity scenario, demand scenario]
    examples:
      - "what happens to service if demand rises 8 percent and capacity only 3"
      - "run an S&OP scenario for Q4 with a second shift"

  - name: get_promotion_calendar
    description:
      Lists upcoming trade promotions by region with affected SKUs, date windows, and
      expected uplift percentages. Use when demand spikes need explaining or when a forecast
      must account for planned commercial activity.
    tags: [planning, read, promotions, demand]
    aliases: [promo calendar, upcoming promotions, trade promotions, marketing events, planned uplift]
    examples:
      - "what promotions are coming up in EMEA"
      - "is there a promo driving the spike on this SKU"

  - name: calculate_safety_stock
    description:
      Computes safety stock and reorder point from demand variability, supply lead time, and
      a target service level, returning the z-score and days of cover used. Use for buffer
      sizing and reorder policy questions.
    tags: [planning, read, safety-stock, inventory, policy]
    aliases: [buffer stock, reorder point, ROP, how much buffer, service level target, days of cover]
    examples:
      - "what safety stock do we need for SKU-4821 at 98 percent service"
      - "calculate the reorder point given a 21 day lead time"

  - name: generate_replenishment_plan
    description:
      Produces suggested replenishment order lines for a site from forecast, on-hand, and
      reorder point, each with quantity, need-by date, source, and urgency. Use when the
      user asks what to buy or move next.
    tags: [planning, write, replenishment, buy-plan]
    aliases: [what should we order, buy plan, replenishment orders, resupply plan, suggested orders]
    examples:
      - "generate a replenishment plan for DC-ATL-01"
      - "what do we need to reorder in the next six weeks"

  # ---------------------------------------------------------------- inventory
  - name: get_inventory_levels
    description:
      Returns network-wide on-hand, allocated, available-to-promise, and in-transit
      quantities for one or more SKUs, with days of supply. Use for availability checks and
      any question about how much inventory exists.
    tags: [inventory, read, stock, availability]
    aliases: [on hand, ATP, available to promise, how many units, stock level, in stock, days of supply]
    examples:
      - "how much SKU-4821 do we have across the network"
      - "what is available to promise for these three parts"

  - name: get_inventory_by_location
    description:
      Breaks a SKU balance down by site, zone, and bin with a per-location status such as
      available, quarantine, damaged, or reserved. Use to find where physical stock sits or
      to locate quarantined material.
    tags: [inventory, read, location, warehouse, bin]
    aliases: [where is the stock, by warehouse, by bin, stock by site, which DC has it, quarantined stock]
    examples:
      - "where is SKU-4821 physically sitting"
      - "which site holds the most of this part"

  - name: check_stock_availability
    description:
      Answers whether a requested quantity can be promised from a site by a requested date,
      returning available quantity, shortfall, earliest full-quantity date, and alternate
      sites. Use for order promising and commit or no-commit decisions.
    tags: [inventory, read, atp, promising, availability]
    aliases: [can we fulfill, can we commit, is there enough, shortfall, promise date, order promising]
    examples:
      - "can we ship 15000 units of SKU-4821 from Dallas in three weeks"
      - "do we have enough to commit to this order"

  - name: reserve_inventory
    description:
      Soft-allocates stock against a sales order or work order reference, returning a
      reservation id and whether the reservation was confirmed, partial, or rejected. Use to
      hold units so another order cannot consume them.
    tags: [inventory, write, reservation, allocation]
    aliases: [hold stock, allocate units, soft allocate, reserve units, put on hold]
    examples:
      - "reserve 3000 units of SKU-4821 for the Acme order"
      - "hold that stock against work order WO-1201"

  - name: release_inventory_reservation
    description:
      Releases a previously created soft allocation and returns the quantity freed. Use when
      a hold is no longer needed and the stock should return to available.
    tags: [inventory, write, reservation, release]
    aliases: [cancel reservation, release hold, free up stock, unreserve, drop the hold]
    examples:
      - "release reservation RSV-402118"
      - "free up the stock we held for that cancelled order"

  - name: transfer_stock
    description:
      Creates an inter-site stock transfer order with ETA, transit days, and cost, at
      standard or expedited priority. Use to rebalance inventory between distribution
      centers or plants.
    tags: [inventory, write, transfer, sto, logistics]
    aliases: [move stock, STO, stock transfer, rebalance inventory, ship between DCs, redeploy units]
    examples:
      - "transfer 1800 units from Reno to Atlanta, expedite it"
      - "move stock from DC-DFW-02 to cover the Atlanta gap"

  - name: get_inventory_aging
    description:
      Returns aging buckets for a site with units and value per bucket, plus slow-moving and
      write-off risk exposure. Use for working capital, obsolescence, and SLOB questions.
    tags: [inventory, read, aging, slob, working-capital]
    aliases: [slow moving, obsolete inventory, SLOB, aged stock, write off risk, dead stock, aging buckets]
    examples:
      - "how much aged inventory is sitting at DC-ATL-01"
      - "what is our obsolescence exposure"

  - name: get_expiring_lots
    description:
      Lists lots approaching expiry or shelf-life limits at a site with days remaining and a
      suggested action. Use for FEFO management and markdown or scrap decisions.
    tags: [inventory, read, lots, expiry, fefo]
    aliases: [expiring stock, shelf life, FEFO, expiry dates, about to expire, use by date]
    examples:
      - "what lots expire in the next 60 days at Atlanta"
      - "is anything about to go out of shelf life"

  - name: adjust_inventory
    description:
      Posts a positive or negative inventory adjustment with a reason code such as damage,
      shrink, found, cycle count, or scrap, returning the new on-hand and the financial
      impact. Use to write stock off, quarantine it, or correct a count.
    tags: [inventory, write, adjustment, quarantine, scrap]
    aliases: [write off, quarantine stock, scrap units, shrink, inventory correction, block stock, adjust count]
    examples:
      - "quarantine the 3343 units at PLANT-MTY-01"
      - "write off 120 damaged units of SKU-4821"

  - name: cycle_count_request
    description:
      Schedules a cycle count task for a site, SKU, or zone and returns the task id,
      scheduled date, assigned operator, and number of locations to count. Use when stock
      accuracy is in doubt.
    tags: [inventory, write, cycle-count, accuracy]
    aliases: [count stock, physical count, stock take, recount, verify inventory, audit the bin]
    examples:
      - "schedule a high priority cycle count for zone A at Atlanta"
      - "we need a recount on this SKU"

  - name: get_stockout_risk
    description:
      Ranks SKUs at a site by probability of stockout within a horizon, with projected
      stockout date, lost revenue exposure, and the primary driver. Use for proactive
      shortage triage and to find what will break first.
    tags: [inventory, read, risk, stockout, shortage]
    aliases: [what will stock out, shortage risk, run out, at risk SKUs, projected shortage, going to run out]
    examples:
      - "what is most likely to stock out at DC-DFW-02 in 30 days"
      - "which parts are at risk and why"

  - name: get_inventory_valuation
    description:
      Returns the financial valuation of inventory at a site by costing method with a
      category breakdown and obsolescence reserve. Use for balance-sheet and inventory value
      questions.
    tags: [inventory, read, valuation, finance]
    aliases: [inventory value, stock value, FIFO, weighted average, balance sheet inventory, how much is it worth]
    examples:
      - "what is our inventory worth at DC-ATL-01 on FIFO"
      - "break inventory value down by category"

  # ---------------------------------------------------------------- product
  - name: search_products
    description:
      Resolves a product name, keyword, partial description, or category to canonical SKU
      identifiers with name, category, and unit cost. Prerequisite for most other tools. Use
      whenever the user refers to a product by name rather than by SKU number.
    tags: [product, read, lookup, utility, search]
    aliases: [find product, product code, item number, resolve sku, what is the sku, search parts, look up item]
    examples:
      - "what is the sku for the battery pack"
      - "find all control board parts"
    alwaysInclude: true

  - name: get_product_details
    description:
      Returns the full item-master record for a SKU including category, unit cost, unit of
      measure, weight, dimensions, lifecycle status, primary supplier, lead time, HS tariff
      code, and hazmat flag. Use for any detailed question about a specific part.
    tags: [product, read, master-data, item-master]
    aliases: [product details, item master, part information, spec, part lead time, primary supplier, HS code, hazmat]
    examples:
      - "tell me everything about SKU-4821"
      - "what is the lead time and supplier for this part"

  - name: get_bom
    description:
      Returns the multi-level bill of materials for a finished good with component SKUs,
      quantity per unit, BOM level, and long-lead flags. Use to explode a product into its
      components or find which component is the constraint.
    tags: [product, read, bom, components, engineering]
    aliases: [bill of materials, BOM, components, what goes into, parts list, explode the product, sub assemblies]
    examples:
      - "what components go into SKU-4821"
      - "show me the BOM and flag the long lead items"

  - name: get_product_substitutes
    description:
      Lists approved alternate or substitute parts for a SKU with approval status, cost
      delta, and form-fit-function qualification notes. Use when the primary part is
      unavailable, on quality hold, or too expensive.
    tags: [product, read, substitutes, alternates, sourcing]
    aliases: [alternate part, substitute, replacement part, cross reference, second source part, can we swap]
    examples:
      - "is there an approved substitute for SKU-4821"
      - "what can we use instead while this part is on hold"

  - name: get_item_master_changes
    description:
      Lists recent engineering change orders and master-data edits affecting supply, with the
      changed field, old and new values, effective date, and supply impact. Use to explain
      why a part cost, supplier, or lead time moved.
    tags: [product, read, eco, change-control, master-data]
    aliases: [engineering change, ECO, what changed, master data changes, why did the cost change, revision history]
    examples:
      - "what item master changes happened in the last 30 days"
      - "why did the lead time on this part change"

  - name: get_uom_conversion
    description:
      Converts a quantity between units of measure for a SKU and returns the conversion
      factor used. Use when quantities are expressed in different units across systems.
    tags: [product, read, uom, conversion, utility]
    aliases: [unit conversion, convert units, how many per box, EA to BOX, kilograms to each, pack size]
    examples:
      - "convert 40 boxes of SKU-4821 to each"
      - "how many units are in a box of this part"

  - name: get_product_compliance
    description:
      Returns regulatory compliance status for a SKU into a destination country covering
      RoHS, REACH, conflict minerals, certifications, restrictions, and documentation gaps.
      Use before shipping into a market or when an import is blocked.
    tags: [product, read, compliance, regulatory, trade]
    aliases: [RoHS, REACH, conflict minerals, can we ship it there, import restrictions, certifications, CMRT]
    examples:
      - "is SKU-4821 compliant for import into the US"
      - "what documentation are we missing to ship this to the EU"

  # ---------------------------------------------------------------- procurement
  - name: search_suppliers
    description:
      Finds approved suppliers by commodity, region, or capability, returning supplier id,
      name, region, approved-vendor-list status, and annual spend. Use to resolve a supplier
      by name or to find candidates for a commodity.
    tags: [procurement, read, supplier, lookup, search]
    aliases: [find supplier, vendor search, who supplies, AVL, approved vendors, supplier list, sourcing options]
    examples:
      - "who are our approved electronics suppliers in APAC"
      - "find suppliers for polymer housings"

  - name: get_supplier_profile
    description:
      Returns the supplier master record with manufacturing sites, payment terms, incoterms,
      certifications, primary contact, and supply tier. Use for background on a specific
      supplier before negotiating or escalating.
    tags: [procurement, read, supplier, master-data]
    aliases: [supplier details, vendor profile, payment terms, incoterms, supplier certifications, who is our contact]
    examples:
      - "tell me about Pune Circuit Systems"
      - "what are the payment terms with this supplier"

  - name: get_supplier_scorecard
    description:
      Returns a supplier performance scorecard for a period with on-time delivery percentage,
      quality defect PPM, responsiveness, cost score, and an overall letter grade. Use to
      judge how a supplier is actually performing.
    tags: [procurement, read, supplier, performance, scorecard, quality]
    aliases: [supplier performance, OTD, on time delivery, defect PPM, supplier grade, how are they performing]
    examples:
      - "show the Q3 scorecard for our battery supplier"
      - "what is their on-time delivery and PPM"

  - name: get_supplier_capacity
    description:
      Returns committed versus available weekly capacity at a supplier for a specific part
      over a horizon, plus upside flexibility percentage. Use before asking a supplier for
      more volume.
    tags: [procurement, read, supplier, capacity]
    aliases: [supplier capacity, can they make more, upside, available capacity, how much can they supply]
    examples:
      - "does this supplier have capacity for another 6000 units"
      - "what upside flexibility do we have with them"

  - name: get_supplier_lead_times
    description:
      Compares quoted versus actual lead times for supplier and SKU pairs with standard
      deviation and an improving, stable, or worsening trend. Use to detect lead-time creep
      and unreliable commitments.
    tags: [procurement, read, supplier, lead-time, reliability]
    aliases: [lead time, quoted vs actual, how long do they take, delivery time, lead time variability, slipping]
    examples:
      - "are this supplier lead times getting worse"
      - "quoted versus actual lead time on these components"

  - name: get_supplier_risk_score
    description:
      Returns a weighted composite supplier risk score across delivery, financial,
      geographic, single-source, and ESG dimensions with top drivers and a recommended
      action. Use to decide whether to dual-source or escalate.
    tags: [procurement, read, supplier, risk, resilience]
    aliases: [supplier risk, how risky, single source risk, financial risk, should we dual source, vendor risk]
    examples:
      - "how risky is our sole supplier for this component"
      - "which risk drivers are worst for this vendor"

  - name: create_rfq
    description:
      Issues a request for quote to a set of suppliers for a SKU and quantity with a response
      due date, returning the RFQ id. Use to start a competitive sourcing event.
    tags: [procurement, write, rfq, sourcing]
    aliases: [request for quote, RFQ, go out to bid, solicit quotes, run a tender, sourcing event]
    examples:
      - "issue an RFQ for 240000 units of SKU-4821 to our top three suppliers"
      - "put this part out to bid"

  - name: get_rfq_responses
    description:
      Returns collected supplier quotes for an RFQ with unit price, lead time, minimum order
      quantity, quote validity, and which supplier is cheapest. Use to compare bids before
      awarding.
    tags: [procurement, read, rfq, quotes, sourcing]
    aliases: [quotes, bids, RFQ responses, who quoted what, cheapest quote, compare bids, pricing responses]
    examples:
      - "what did suppliers quote on RFQ-114820"
      - "compare the bids and tell me who is cheapest"

  - name: award_rfq
    description:
      Awards an RFQ to a selected supplier at a given share percentage and returns award terms
      including annual value and contract start date. Use to conclude a sourcing event or to
      split award between suppliers.
    tags: [procurement, write, rfq, award, sourcing]
    aliases: [award the business, give them the contract, split award, select supplier, conclude RFQ, dual source award]
    examples:
      - "award 40 percent of this RFQ to the second source"
      - "give the business to the cheapest qualified supplier"

  - name: create_purchase_order
    description:
      Creates a purchase order against a supplier for one or more lines with optional
      expedite, returning PO number, total value, line count, and promised date. Use to
      actually place a buy.
    tags: [procurement, write, purchase-order, buying]
    aliases: [raise a PO, place an order, buy it, cut a purchase order, order from supplier, expedite an order]
    examples:
      - "raise an expedited PO for 6000 units of the component"
      - "place a purchase order with Kyoto Precision"

  - name: get_purchase_order
    description:
      Retrieves a purchase order header and lines with ordered versus received quantities,
      promised dates, and overall receipt status. Use to check the state of a specific order.
    tags: [procurement, read, purchase-order, status]
    aliases: [PO status, purchase order status, has it been received, what did we order, check the PO, receipt progress]
    examples:
      - "what is the status of PO-140005"
      - "how much of that order has actually arrived"

  - name: update_purchase_order
    description:
      Changes quantity, need-by date, or expedite flag on an open purchase order line and
      returns the new promised date, any expedite fee, and the revision number. Use to pull
      in, push out, or resize an existing order.
    tags: [procurement, write, purchase-order, expedite, change]
    aliases: [change the PO, pull in the order, push out delivery, expedite it, increase quantity, revise the order]
    examples:
      - "expedite PO-140005 and tell me the fee"
      - "push that delivery out two weeks"

  - name: cancel_purchase_order
    description:
      Cancels an open purchase order or a single line and returns the cancellation fee and
      non-cancellable non-returnable exposure. Use when demand disappears or a supplier is
      disqualified.
    tags: [procurement, write, purchase-order, cancellation, liability]
    aliases: [cancel the order, kill the PO, cancellation fee, NCNR, stop the shipment, back out of the order]
    examples:
      - "cancel PO-140005 and tell me what it costs us"
      - "what is our NCNR exposure if we cancel"

  - name: get_open_pos
    description:
      Lists open purchase orders filtered by supplier, site, or SKU, optionally only past-due
      ones, with open quantity, promised date, days late, and total open value. Use to see
      what is still inbound or what is running late.
    tags: [procurement, read, purchase-order, open-orders, late]
    aliases: [open orders, what is inbound, late POs, past due orders, incoming supply, outstanding orders, on order]
    examples:
      - "what is still inbound from this supplier"
      - "show me all past-due purchase orders"

  - name: get_supplier_contracts
    description:
      Returns active supplier contracts with type, start and end dates, annual value, rebate
      percentage, and auto-renew flag, optionally filtered to those expiring soon. Use for
      contract renewal and rebate questions.
    tags: [procurement, read, contract, commercial]
    aliases: [supplier contract, agreement, when does it expire, rebate, auto renew, MSA, volume agreement]
    examples:
      - "which supplier contracts expire in the next 180 days"
      - "what rebate terms do we have with them"

  # ---------------------------------------------------------------- manufacturing
  - name: get_production_plan
    description:
      Returns the master production schedule for a plant over a horizon with per-week SKU
      quantities, firm versus planned flags, and planned utilization. Use to see what a plant
      intends to build.
    tags: [manufacturing, read, production, schedule, mps]
    aliases: [production schedule, MPS, what are we building, plant schedule, build plan, planned output]
    examples:
      - "what is PLANT-SZX-02 scheduled to build over four weeks"
      - "show me the production plan and utilization"

  - name: create_work_order
    description:
      Releases a manufacturing work order for a SKU at a plant at standard or rush priority,
      returning the work order id, scheduled start and finish, assigned line, and any
      material shortages. Use to actually start a build.
    tags: [manufacturing, write, work-order, production]
    aliases: [start a build, release a work order, make it, rush build, schedule production, WO]
    examples:
      - "release a rush work order for 11800 units at Monterrey"
      - "start a build to cover the shortfall"

  - name: get_work_order_status
    description:
      Returns progress on a work order with status, completed and scrapped units, percent
      complete, and any blocker. Use to check whether a build is on track.
    tags: [manufacturing, read, work-order, status, progress]
    aliases: [work order status, is the build done, how far along, WO progress, is it blocked, completed units]
    examples:
      - "what is the status of WO-380345"
      - "is that build blocked on anything"

  - name: get_plant_capacity
    description:
      Returns available versus committed weekly capacity by production line with shift
      pattern and identifies the bottleneck line. Use to answer whether a plant can absorb
      more volume and where the constraint sits.
    tags: [manufacturing, read, capacity, plant, bottleneck]
    aliases: [plant capacity, can we build more, bottleneck, line capacity, shifts, spare capacity, constraint]
    examples:
      - "does Monterrey have capacity for a rush order"
      - "which line is the bottleneck at this plant"

  - name: get_machine_downtime
    description:
      Returns unplanned downtime events for a plant with asset, reason, hours lost, and date,
      plus overall equipment effectiveness. Use to explain missed output or unstable
      processes.
    tags: [manufacturing, read, downtime, oee, reliability]
    aliases: [OEE, downtime, machine failure, unplanned stoppage, why did we miss output, equipment effectiveness]
    examples:
      - "what downtime has PLANT-SZX-02 had in the last 14 days"
      - "what is our OEE and what is driving it down"

  - name: get_quality_inspections
    description:
      Returns incoming and in-process inspection results for a site with pass, fail, or
      conditional result, defect PPM, quantity on hold, and the manufacturing lot id. This is
      the primary way to find a failed lot id. Use for quality hold and inspection questions.
    tags: [manufacturing, read, quality, inspection, lot, defect]
    aliases: [quality inspection, failed inspection, defect rate, PPM, what is on hold, lot id, quality hold, QC results]
    examples:
      - "did anything fail inspection at DC-ATL-01 in the last 30 days"
      - "which lot failed and how many units are on hold"

  - name: record_quality_issue
    description:
      Opens a non-conformance report or supplier corrective action request against a lot or
      supplier, returning the NCR id, whether a SCAR is required, the disposition, and the
      containment deadline. Use to formally log a defect.
    tags: [manufacturing, write, quality, ncr, scar, defect]
    aliases: [raise an NCR, non conformance, SCAR, log a defect, quality issue, containment, disposition]
    examples:
      - "raise a critical NCR against this lot for thermal cutoff deviation"
      - "open a supplier corrective action for the defect"

  - name: get_yield_metrics
    description:
      Returns first-pass yield, scrap rate, and rework rate for a plant or SKU with a weekly
      trend. Use to assess manufacturing process stability.
    tags: [manufacturing, read, yield, scrap, quality, metrics]
    aliases: [first pass yield, FPY, scrap rate, rework, yield trend, process stability, how good is the line]
    examples:
      - "what is first-pass yield at PLANT-SZX-02 over eight weeks"
      - "is our scrap rate trending up"

  # ---------------------------------------------------------------- logistics
  - name: get_shipments
    description:
      Lists inbound or outbound shipments filtered by site, status, or purchase order, with
      carrier, origin, destination, ETA, status, and units. Use for a broad view of what is
      moving.
    tags: [logistics, read, shipment, freight]
    aliases: [shipments, what is in transit, inbound freight, outbound, deliveries on the way, freight status]
    examples:
      - "what inbound shipments are heading to DC-ATL-01"
      - "show me everything in transit against this PO"

  - name: track_shipment
    description:
      Returns detailed milestone tracking for a single shipment with current location, ETA
      versus original ETA, delay days, event history, and any exception. Use for
      where-is-my-shipment questions.
    tags: [logistics, read, shipment, tracking, exception]
    aliases: [track it, where is my shipment, ETA, is it late, delayed shipment, milestones, shipment exception]
    examples:
      - "track SHP-418203 and tell me if it is late"
      - "why is this container delayed"

  - name: create_shipment
    description:
      Creates an outbound shipment from an order or transfer reference by ocean, air, truck,
      rail, or parcel, returning shipment id, ETA, cost, carrier, and tracking number. Use to
      physically move goods.
    tags: [logistics, write, shipment, freight]
    aliases: [ship it, create a shipment, send the units, book freight, dispatch, arrange transport]
    examples:
      - "create an air shipment for the transfer to Atlanta"
      - "ship those units by truck from Dallas"

  - name: get_carrier_rates
    description:
      Compares contracted and spot rates across carriers for a lane and mode with transit days
      and on-time reliability, identifying cheapest and fastest. Use before booking freight.
    tags: [logistics, read, rates, carrier, cost]
    aliases: [freight rates, shipping cost, carrier quotes, cheapest carrier, fastest carrier, spot rate, lane pricing]
    examples:
      - "compare air rates from Shanghai to Los Angeles"
      - "who is cheapest and who is fastest on this lane"

  - name: book_carrier
    description:
      Books capacity with a carrier for a shipment at economy, standard, or express service
      level, returning booking id, confirmation status, pickup date, ETA, and rate. Use to
      commit freight to a carrier.
    tags: [logistics, write, carrier, booking]
    aliases: [book the carrier, reserve freight, confirm shipping, express booking, arrange pickup]
    examples:
      - "book XPO express for that shipment"
      - "confirm the carrier and give me the pickup date"

  - name: get_transit_times
    description:
      Returns expected and P90 transit times for a lane and mode with variability and on-time
      reliability percentage. Use to set realistic delivery promises.
    tags: [logistics, read, transit, lane, reliability]
    aliases: [how long does it take, transit time, P90, lane reliability, shipping duration, how many days]
    examples:
      - "how long does Monterrey to Dallas take by truck"
      - "what is the P90 transit time on this lane"

  - name: get_port_congestion
    description:
      Returns berth wait times, container dwell, and a congestion index for named ports with
      an improving, stable, or worsening trend. Use to anticipate ocean freight delays.
    tags: [logistics, read, port, congestion, ocean]
    aliases: [port delays, berth wait, container dwell, congestion, is the port backed up, terminal delays]
    examples:
      - "how congested are Shanghai and Los Angeles right now"
      - "should we expect port delays on this route"

  - name: get_customs_status
    description:
      Returns customs clearance state for a shipment in a country with duties, tariff rate,
      any hold reason, and estimated release date. Use when goods are stuck at the border.
    tags: [logistics, read, customs, trade, duties]
    aliases: [customs hold, cleared customs, duties, tariff, stuck at the border, import clearance, why is it held]
    examples:
      - "has SHP-418203 cleared US customs"
      - "why is this shipment on customs hold"

  - name: get_freight_invoice
    description:
      Returns freight invoice detail with base charge, fuel surcharge, accessorial charges,
      and audit variance against the original quote. Use for freight bill audit and
      overcharge questions.
    tags: [logistics, read, invoice, freight, audit, cost]
    aliases: [freight bill, shipping invoice, accessorials, detention, fuel surcharge, were we overcharged, invoice audit]
    examples:
      - "show the freight invoice for this shipment and any variance"
      - "what accessorial charges did the carrier add"

  - name: estimate_landed_cost
    description:
      Computes total landed cost as goods plus freight, duty, insurance, and handling for a
      quantity moving between two countries, returning total and per-unit cost. Use for
      sourcing and pricing decisions.
    tags: [logistics, read, landed-cost, finance, trade]
    aliases: [landed cost, total cost to deliver, duty and freight, cost per unit delivered, all in cost, import cost]
    examples:
      - "what is the landed cost of 15000 units from Mexico to the US"
      - "how much per unit once duty and freight are included"

  - name: get_route_options
    description:
      Returns alternative routings for a lane with mode, transshipment point, transit days,
      cost, and carbon, plus a recommended option. Use to trade speed against cost or
      emissions.
    tags: [logistics, read, routing, options, carbon]
    aliases: [alternate route, routing options, faster route, cheaper route, reroute, transshipment, via]
    examples:
      - "what routing options do we have from Shanghai under 20 days"
      - "is there a cheaper way to move this"

  - name: get_dock_appointments
    description:
      Returns the dock door schedule and open slots at a site for a date, with carrier and
      appointment status per slot. Use to see receiving or shipping dock availability.
    tags: [logistics, read, dock, appointment, warehouse]
    aliases: [dock schedule, door availability, receiving slots, appointment times, open dock slots]
    examples:
      - "what dock slots are open at Atlanta tomorrow"
      - "show the dock door schedule for that site"

  - name: schedule_dock_appointment
    description:
      Books a receiving or shipping dock slot for a shipment at a site and returns the
      appointment id, assigned door, and confirmed slot. Use to secure a delivery window.
    tags: [logistics, write, dock, appointment, scheduling]
    aliases: [book a dock, schedule delivery window, reserve a door, receiving appointment, set a delivery slot]
    examples:
      - "book an early dock slot at Atlanta for that inbound shipment"
      - "schedule the delivery appointment"

  # ---------------------------------------------------------------- warehouse
  - name: get_warehouse_capacity
    description:
      Returns storage utilization, total and occupied pallet positions, available positions,
      labor hours, and the primary constraint at a site. Use to check whether a warehouse can
      absorb more volume.
    tags: [warehouse, read, capacity, storage, labor]
    aliases: [warehouse space, pallet positions, how full is the DC, storage capacity, labor capacity, is there room]
    examples:
      - "how full is DC-DFW-02 and what is the constraint"
      - "do we have space to receive this inbound"

  - name: get_pick_pack_queue
    description:
      Returns open pick waves, line and unit backlog, projected hours to clear, and orders at
      risk of missing SLA at a site. Use to assess fulfillment throughput pressure.
    tags: [warehouse, read, fulfillment, backlog, pick-pack]
    aliases: [pick queue, backlog, waves, how behind are we, orders at risk, fulfillment backlog, pick pack]
    examples:
      - "how big is the pick backlog at Atlanta"
      - "how many orders will miss SLA today"

  - name: create_outbound_order
    description:
      Creates a customer sales order for fulfillment from a site at standard or expedited
      service, returning order id, promised date, and total value. Use to book a customer
      order into fulfillment.
    tags: [warehouse, write, order, sales-order, fulfillment]
    aliases: [create an order, book the order, sales order, customer order, place order for customer, SO]
    examples:
      - "create an expedited order for 15000 units for Acme from Dallas"
      - "book that customer order into the system"

  - name: get_order_status
    description:
      Returns fulfillment status for a sales order with allocation percentage, linked shipment,
      promised versus projected date, and whether it is on time. Use for where-is-my-order
      questions.
    tags: [warehouse, read, order, status, fulfillment]
    aliases: [order status, is it shipped, will it be on time, order tracking, allocation status, backordered]
    examples:
      - "what is the status of SO-771204"
      - "is that customer order going to ship on time"

  - name: allocate_order
    description:
      Runs allocation and available-to-promise logic against a sales order using a FIFO,
      nearest-site, lowest-cost, or fastest strategy, returning allocated lines, sourcing
      site, and any backorder. Use to commit inventory to an order.
    tags: [warehouse, write, allocation, atp, fulfillment]
    aliases: [allocate the order, commit stock, run allocation, source the order, ATP run, backorder]
    examples:
      - "allocate SO-771204 using the fastest strategy"
      - "commit inventory to that order and tell me the backorder"

  - name: get_returns
    description:
      Returns reverse-logistics RMAs at a site with SKU, quantity, reason code, disposition,
      credit value, and received date, plus the overall return rate. Use for returns and
      reverse-logistics questions.
    tags: [warehouse, read, returns, rma, reverse-logistics]
    aliases: [RMA, returns, sent back, return rate, why are they returning, restock, refurbish, reverse logistics]
    examples:
      - "what has been returned to Atlanta in the last 90 days"
      - "what is our return rate and the main reason"

  # ---------------------------------------------------------------- risk and analytics
  - name: get_weather_risk
    description:
      Returns severe weather and natural-hazard risk for named sites, ports, or countries with
      risk level, hazard type, expected window, and operational impact. Use to anticipate
      weather disruption to supply or freight.
    tags: [risk, read, weather, hazard, disruption]
    aliases: [weather risk, typhoon, hurricane, storm, flooding, will weather hit us, natural hazard]
    examples:
      - "is there weather risk to Shenzhen in the next two weeks"
      - "will a storm affect our ports"

  - name: get_geopolitical_alerts
    description:
      Returns trade policy, tariff, sanction, strike, border, and conflict alerts by region
      with severity, summary, and affected lanes. Use for political and trade disruption
      questions.
    tags: [risk, read, geopolitical, tariff, trade, strike]
    aliases: [tariffs, sanctions, port strike, trade policy, export controls, border closure, political risk]
    examples:
      - "any geopolitical alerts affecting APAC shipping"
      - "are there tariff changes we should worry about"

  - name: simulate_disruption
    description:
      Models the network impact of a supplier outage, port closure, plant shutdown, demand
      spike, or carrier failure over a duration, returning revenue at risk, SKUs and orders
      impacted, first stockout date, recovery time, and costed mitigation options. Use for
      what-if disruption analysis.
    tags: [risk, write, simulation, disruption, scenario, mitigation]
    aliases: [what if the supplier fails, disruption impact, revenue at risk, contingency, mitigation options, stress test]
    examples:
      - "model a 21 day outage at our battery supplier"
      - "what happens if Shenzhen shuts down for ten days"

  - name: get_kpi_dashboard
    description:
      Returns headline supply chain KPIs for a scope and period including OTIF, fill rate,
      inventory turns, cash-to-cash cycle, cost per order, and perfect order percentage
      against target. Use for overall performance questions.
    tags: [risk, read, kpi, metrics, performance, dashboard]
    aliases: [OTIF, fill rate, inventory turns, cash to cash, perfect order, how are we performing, supply chain KPIs]
    examples:
      - "how is the supply chain performing this quarter"
      - "what is our OTIF and are we above target"

  - name: get_carbon_footprint
    description:
      Returns scope 3 transport and product carbon footprint for a SKU, lane, site, or supplier
      with a breakdown by transport mode, intensity per unit, and reduction levers. Use for
      sustainability and emissions questions.
    tags: [risk, read, carbon, sustainability, esg, emissions]
    aliases: [carbon footprint, CO2, emissions, scope 3, sustainability, green, reduce emissions]
    examples:
      - "what is our carbon footprint for NA freight this quarter"
      - "how can we cut emissions on this lane"

  - name: get_cost_to_serve
    description:
      Returns fully loaded cost-to-serve by customer, channel, SKU, or region with revenue,
      COGS, logistics, warehousing, and returns cost, net margin percentage, and margin
      leakage drivers. Use for profitability questions.
    tags: [risk, read, cost-to-serve, margin, profitability, finance]
    aliases: [cost to serve, margin, profitability, are they profitable, margin leakage, what does it cost to serve]
    examples:
      - "what is our net margin serving Contoso Electronics"
      - "where is margin leaking by region"
```