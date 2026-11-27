import Capacitor
import StoreKit
import UIKit

/// `AppPurchases` in JS (src/native/purchases.ts): Rerack Plus through StoreKit 2. No server of our own: StoreKit
/// verifies each transaction on the device (signed by Apple), and the app syncs what it found into the user's settings
/// so the web app and other devices know.
@objc(AppPurchasesPlugin)
public class AppPurchasesPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppPurchasesPlugin"
    public let jsName = "AppPurchases"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "products", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "entitlements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "manage", returnType: CAPPluginReturnPromise),
    ]

    private var updates: Task<Void, Never>?

    /// Apple asks apps to listen from launch: renewals, refunds, Ask to Buy approvals and purchases made on another
    /// device arrive here, as do transactions left unfinished last time. Each is finished and JS is told to re-read.
    override public func load() {
        updates = Task.detached { [weak self] in
            for await result in Transaction.updates {
                if case .verified(let transaction) = result {
                    await transaction.finish()
                }
                self?.notifyListeners("changed", data: [:])
            }
        }
    }

    deinit {
        updates?.cancel()
    }

    @objc func products(_ call: CAPPluginCall) {
        let ids = call.getArray("ids", String.self) ?? []
        Task {
            do {
                let products = try await Product.products(for: ids)
                call.resolve(["products": products.map(Self.describe)])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else {
            call.reject("Needs id")
            return
        }
        Task { @MainActor in
            do {
                guard let product = try await Product.products(for: [id]).first else {
                    call.reject("That isn't for sale right now.")
                    return
                }
                let result: Product.PurchaseResult
                if let scene = self.bridge?.viewController?.view.window?.windowScene {
                    result = try await product.purchase(confirmIn: scene)
                } else {
                    result = try await product.purchase()
                }
                switch result {
                case .success(let verification):
                    guard case .verified(let transaction) = verification else {
                        call.reject("The App Store couldn't confirm this purchase.")
                        return
                    }
                    await transaction.finish()
                    var state = await Self.storeState()
                    state["status"] = "purchased"
                    call.resolve(state)
                case .userCancelled:
                    call.resolve(["status": "cancelled"])
                case .pending:
                    // Ask to Buy or a payment needing attention: it arrives later through Transaction.updates.
                    call.resolve(["status": "pending"])
                @unknown default:
                    call.resolve(["status": "cancelled"])
                }
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func entitlements(_ call: CAPPluginCall) {
        Task {
            call.resolve(await Self.storeState())
        }
    }

    /// Restore Purchases (App Review wants the button): transactions normally sync by themselves, so this is only
    /// for when they didn't. It may ask for the Apple ID password.
    @objc func restore(_ call: CAPPluginCall) {
        Task {
            do {
                try await AppStore.sync()
                call.resolve(await Self.storeState())
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func manage(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard let scene = self.bridge?.viewController?.view.window?.windowScene else {
                call.reject("No window")
                return
            }
            do {
                try await AppStore.showManageSubscriptions(in: scene)
                call.resolve()
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    // MARK: - State

    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    /// `active`: verified transactions granting something now (a running subscription, the lifetime purchase), not
    /// refunded. `known`: every original transaction id this Apple ID has here, so JS can tell its own lapsed
    /// purchase from one made under another Apple ID (core/plus.ts `syncedPlus`).
    private static func storeState() async -> [String: Any] {
        var active: [[String: Any]] = []
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result, transaction.revocationDate == nil else { continue }
            var entry: [String: Any] = [
                "productId": transaction.productID,
                "originalId": String(transaction.originalID),
                "purchasedAt": iso.string(from: transaction.purchaseDate),
                "expiresAt": transaction.expirationDate.map { iso.string(from: $0) } ?? NSNull(),
            ]
            if let status = await transaction.subscriptionStatus, case .verified(let renewal) = status.renewalInfo {
                entry["willRenew"] = renewal.willAutoRenew
            }
            active.append(entry)
        }
        var known = Set<String>()
        for await result in Transaction.all {
            if case .verified(let transaction) = result {
                known.insert(String(transaction.originalID))
            }
        }
        return ["active": active, "known": Array(known)]
    }

    private static func describe(_ product: Product) -> [String: Any] {
        var out: [String: Any] = [
            "id": product.id,
            "name": product.displayName,
            "description": product.description,
            "price": product.displayPrice,
            "priceValue": NSDecimalNumber(decimal: product.price).doubleValue,
        ]
        switch product.type {
        case .autoRenewable: out["type"] = "subscription"
        case .nonConsumable: out["type"] = "lifetime"
        default: out["type"] = "other"
        }
        if let period = product.subscription?.subscriptionPeriod {
            switch period.unit {
            case .day: out["period"] = "day"
            case .week: out["period"] = "week"
            case .month: out["period"] = "month"
            case .year: out["period"] = "year"
            @unknown default: break
            }
            out["periodValue"] = period.value
        }
        return out
    }
}
