// Decoder sweep (spec section 9, review R10). Compiled together with the iOS
// app's own model files, so a response the App Store app would reject fails
// here too. Decodes every page of every category and one reader result per
// category, and checks every published_at against the exact wire format.
//
// Build and run (see docs/deploy-runbook.md):
//   swiftc -O <app>/Models/Article.swift <app>/Models/Category.swift \
//     <app>/Models/ReaderContent.swift scripts/sweep/main.swift -o .fixtures/sweep
//   .fixtures/sweep https://clearnews.nikhil-58a.workers.dev

import Foundation

// Same decoder as APIClient.swift (keyDecodingStrategy and the two ISO formats).
let isoFractional: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f
}()
let iso: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime]
    return f
}()
let decoder: JSONDecoder = {
    let d = JSONDecoder()
    d.keyDecodingStrategy = .convertFromSnakeCase
    d.dateDecodingStrategy = .custom { decoder in
        let c = try decoder.singleValueContainer()
        let s = try c.decode(String.self)
        for f in [isoFractional, iso] {
            if let date = f.date(from: s) { return date }
        }
        throw DecodingError.dataCorruptedError(in: c, debugDescription: "Cannot decode date: \(s)")
    }
    return d
}()

let base = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "https://getclearnews.com"
let dateWire = try! NSRegularExpression(pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$")
var failures: [String] = []
var pages = 0
var articles = 0

func get(_ path: String) async -> Data? {
    guard let url = URL(string: base + path) else { return nil }
    var req = URLRequest(url: url)
    req.setValue("ClearNewsSweep/1.0", forHTTPHeaderField: "User-Agent")
    req.cachePolicy = .reloadIgnoringLocalCacheData
    do {
        let (data, res) = try await URLSession.shared.data(for: req)
        let code = (res as? HTTPURLResponse)?.statusCode ?? 0
        if code != 200 { failures.append("\(path): HTTP \(code)"); return nil }
        return data
    } catch {
        failures.append("\(path): \(error.localizedDescription)")
        return nil
    }
}

func checkDates(_ data: Data, _ path: String) {
    guard let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let list = obj["articles"] as? [[String: Any]] else { return }
    for a in list {
        if let s = a["published_at"] as? String,
           dateWire.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) == nil {
            failures.append("\(path): published_at \(s)")
        }
    }
}

let enc: (String) -> String = { $0.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed.subtracting(CharacterSet(charactersIn: "&=+"))) ?? $0 }

guard let catData = await get("/api/v1/categories"),
      let categories = try? decoder.decode([Category].self, from: catData) else {
    print("FAIL: categories did not decode")
    exit(1)
}

for cat in categories {
    var page = 1
    var firstUrl: String?
    while true {
        let path = "/api/v1/articles?category=\(cat.id)&page=\(page)&per_page=50"
        guard let data = await get(path) else { break }
        do {
            let r = try decoder.decode(ArticleListResponse.self, from: data)
            pages += 1
            articles += r.articles.count
            checkDates(data, path)
            if firstUrl == nil { firstUrl = r.articles.first?.url }
            if page >= r.pagination.totalPages { break }
            page += 1
        } catch {
            failures.append("\(path): \(error)")
            break
        }
    }
    if let u = firstUrl, let data = await get("/api/v1/articles/reader?url=\(enc(u))") {
        do {
            let r = try decoder.decode(ReaderContent.self, from: data)
            print("reader \(cat.id): \(r.status) \(r.reason ?? "") words=\(r.wordCount ?? 0)")
        } catch {
            failures.append("reader \(u): \(error)")
        }
    }
}

print("categories \(categories.count), pages \(pages), articles \(articles), failures \(failures.count)")
for f in failures.prefix(20) { print("FAIL: \(f)") }
exit(failures.isEmpty ? 0 : 1)
