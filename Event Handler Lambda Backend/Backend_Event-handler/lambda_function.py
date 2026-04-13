import json
import boto3
import os
import hashlib
import math
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from boto3.dynamodb.conditions import Attr

dynamodb = boto3.resource("dynamodb")
s3 = boto3.client("s3")

TABLE_NAME = os.environ.get("TABLE_NAME", "guardian_ai_events")
BUCKET_NAME = os.environ.get("BUCKET_NAME", "aiguardianmodels")
MODEL_PREFIX = os.environ.get("MODEL_PREFIX", "guardian_deploy/")
FRONTEND_ORIGIN = os.environ.get(
    "FRONTEND_ORIGIN",
    "https://main.d1eevjsp6yi7f3.amplifyapp.com"
)

table = dynamodb.Table(TABLE_NAME)


def decimal_to_native(obj):
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    raise TypeError


def clamp01(value):
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        numeric = 0.0
    return max(0.0, min(1.0, numeric))


def number_or_default(value, default=0.0):
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return default
    return numeric if math.isfinite(numeric) else default


def integer_or_default(value, default=0):
    return int(number_or_default(value, default))


def now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def parse_iso_timestamp(value):
    if not value:
        return None

    try:
        normalized = str(value).replace("Z", "+00:00")
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def haversine_km(lat1, lon1, lat2, lon2):
    earth_radius_km = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return earth_radius_km * c


def to_dynamodb_native(value):
    if isinstance(value, float):
        return Decimal(str(round(value, 6)))
    if isinstance(value, list):
        return [to_dynamodb_native(item) for item in value]
    if isinstance(value, dict):
        return {key: to_dynamodb_native(item) for key, item in value.items()}
    return value


def list_events_for_user(user_id):
    items = []
    scan_kwargs = {
        "FilterExpression": Attr("user_id").eq(user_id),
    }

    while True:
        scan_response = table.scan(**scan_kwargs)
        items.extend(scan_response.get("Items", []))

        last_key = scan_response.get("LastEvaluatedKey")
        if not last_key:
            break
        scan_kwargs["ExclusiveStartKey"] = last_key

    return items


def compute_geo_distance_km(current_geo, historical_events):
    if not isinstance(current_geo, dict):
        return None

    current_lat = number_or_default(current_geo.get("lat"), None)
    current_lng = number_or_default(current_geo.get("lng"), None)
    if current_lat is None or current_lng is None:
        return None

    latest_geo_event = None
    latest_geo_time = None

    for event in historical_events:
        event_geo = event.get("geo")
        if not isinstance(event_geo, dict):
            continue

        previous_lat = number_or_default(event_geo.get("lat"), None)
        previous_lng = number_or_default(event_geo.get("lng"), None)
        if previous_lat is None or previous_lng is None:
            continue

        event_time = parse_iso_timestamp(event.get("timestamp"))
        if latest_geo_event is None or (
            event_time is not None and (latest_geo_time is None or event_time > latest_geo_time)
        ):
            latest_geo_event = event
            latest_geo_time = event_time

    if latest_geo_event is None:
        return None

    previous_geo = latest_geo_event["geo"]
    previous_lat = number_or_default(previous_geo.get("lat"), None)
    previous_lng = number_or_default(previous_geo.get("lng"), None)
    if previous_lat is None or previous_lng is None:
        return None

    return round(haversine_km(current_lat, current_lng, previous_lat, previous_lng), 2)


def build_device_fingerprint(device):
    if not isinstance(device, dict) or not device:
        return "UNKNOWN"

    fingerprint_source = json.dumps(
        {
            "platform": device.get("platform"),
            "userAgent": device.get("userAgent"),
            "touchCapable": device.get("touchCapable"),
            "language": device.get("language"),
            "timezone": device.get("timezone"),
            "viewport": device.get("viewport"),
            "screen": device.get("screen"),
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(fingerprint_source.encode("utf-8")).hexdigest()[:12].upper()


def describe_signal(signal):
    descriptions = {
        "HIGH_VALUE_TRANSFER": "high transfer value",
        "ELEVATED_TRANSFER_VALUE": "elevated transfer amount",
        "REPEATED_TARGET_VELOCITY": "repeat transfers to the same recipient",
        "ACCOUNT_VELOCITY_24H": "high recent account velocity",
        "REDUCED_SIGNAL_CAPTURE": "reduced biometric signal coverage",
        "MOTION_PERMISSION_DENIED": "motion permission denied",
        "LOW_MOTION_COVERAGE": "weak motion coverage",
        "SPARSE_KEYPRESS_SIGNAL": "thin typing telemetry",
        "LOCATION_MISSING": "missing geolocation",
        "LOW_GEO_ACCURACY": "low location accuracy",
        "LOCATION_SHIFT_GT_100KM": "location shift above 100 km",
        "LOCATION_SHIFT_GT_500KM": "location shift above 500 km",
        "LOCATION_SHIFT_GT_1500KM": "location shift above 1500 km",
        "INSECURE_CONTEXT": "insecure browser context",
        "DEVICE_CONTEXT_MISSING": "missing device profile",
        "LOW_BIOMETRIC_CONFIDENCE": "low biometric confidence",
        "NO_SIGNALS": "no material risk signals",
    }
    return descriptions.get(signal, signal.replace("_", " ").lower())


def build_reason(decision, top_signals, unified_risk):
    if not top_signals or top_signals == ["NO_SIGNALS"]:
        return (
            f"Guardian approved this transfer with low composite risk "
            f"({round(unified_risk * 100)}%). No material risk signals were detected."
        )

    described_signals = ", ".join(describe_signal(signal) for signal in top_signals[:3])

    if decision == "FREEZE":
        return (
            f"Guardian froze this transfer because {described_signals} "
            f"pushed composite risk to {round(unified_risk * 100)}%."
        )

    if decision == "RISKED":
        return (
            f"Guardian flagged this transfer for manual review because {described_signals} "
            f"pushed composite risk to {round(unified_risk * 100)}%."
        )

    return (
        f"Guardian approved this transfer after checking {described_signals}. "
        f"Residual composite risk stayed low at {round(unified_risk * 100)}%."
    )


def score_ingest_payload(body, historical_events):
    amount = max(0.0, number_or_default(body.get("amount"), 0.0))
    typing_speed = clamp01(body.get("typing_speed", 0.5))
    keypress = body.get("keypress") if isinstance(body.get("keypress"), dict) else {}
    keypress_sample_count = min(
        len(keypress.get("press_systimes", [])) if isinstance(keypress.get("press_systimes"), list) else 0,
        len(keypress.get("release_systimes", [])) if isinstance(keypress.get("release_systimes"), list) else 0,
    )

    capture_mode = str(body.get("capture_mode", "unknown")).strip() or "unknown"
    motion_capture = body.get("motion_capture") if isinstance(body.get("motion_capture"), dict) else {}
    motion_status = str(
        motion_capture.get("status")
        or body.get("motion_permission_state")
        or "unknown"
    ).strip() or "unknown"
    motion_sample_count = integer_or_default(motion_capture.get("sample_count"), 0)
    has_live_capture = (
        capture_mode == "live_biometric"
        and motion_status == "captured"
        and motion_sample_count >= 12
    )

    swipe_default = 0.55 if has_live_capture else 0.32
    swipe_steadiness = clamp01(body.get("swipe_steadiness", swipe_default))

    device = body.get("device") if isinstance(body.get("device"), dict) else {}
    device_platform = str(device.get("platform", "unknown")).strip() or "unknown"
    touch_capable = bool(device.get("touchCapable"))
    secure_context = bool(device.get("secureContext"))
    device_fingerprint = build_device_fingerprint(device)

    geo = body.get("geo") if isinstance(body.get("geo"), dict) else None
    geo_distance_km = compute_geo_distance_km(geo, historical_events)
    geo_accuracy = number_or_default(geo.get("accuracy"), 0.0) if isinstance(geo, dict) else 0.0

    recent_same_user_count = len(historical_events)
    now = datetime.now(timezone.utc)
    recent_24h_count = 0
    for event in historical_events:
        event_time = parse_iso_timestamp(event.get("timestamp"))
        if event_time is None:
            continue
        if now - event_time <= timedelta(days=1):
            recent_24h_count += 1

    top_signals = []

    bms = clamp01(
        0.18
        + typing_speed * 0.34
        + swipe_steadiness * 0.24
        + (0.18 if has_live_capture else -0.07)
        + (0.07 if keypress_sample_count >= 18 else -0.03 if keypress_sample_count < 8 else 0.02)
    )

    if bms < 0.45:
        top_signals.append("LOW_BIOMETRIC_CONFIDENCE")

    gmrs = 0.04
    if not isinstance(geo, dict):
        gmrs += 0.18
        top_signals.append("LOCATION_MISSING")
    else:
        if geo_accuracy >= 1000:
            gmrs += 0.18
            top_signals.append("LOW_GEO_ACCURACY")
        elif geo_accuracy >= 300:
            gmrs += 0.08

        if geo_distance_km is not None:
            if geo_distance_km >= 1500:
                gmrs += 0.55
                top_signals.append("LOCATION_SHIFT_GT_1500KM")
            elif geo_distance_km >= 500:
                gmrs += 0.35
                top_signals.append("LOCATION_SHIFT_GT_500KM")
            elif geo_distance_km >= 100:
                gmrs += 0.18
                top_signals.append("LOCATION_SHIFT_GT_100KM")

    gtrs = 0.04
    if amount >= 250000:
        gtrs += 0.45
        top_signals.append("HIGH_VALUE_TRANSFER")
    elif amount >= 75000:
        gtrs += 0.25
        top_signals.append("ELEVATED_TRANSFER_VALUE")
    elif amount >= 15000:
        gtrs += 0.12

    if recent_same_user_count >= 3:
        gtrs += 0.35
        top_signals.append("REPEATED_TARGET_VELOCITY")
    elif recent_same_user_count >= 1:
        gtrs += 0.16
        top_signals.append("REPEATED_TARGET_VELOCITY")

    if recent_24h_count >= 3:
        gtrs += 0.18
        top_signals.append("ACCOUNT_VELOCITY_24H")

    if capture_mode != "live_biometric":
        gtrs += 0.16
        top_signals.append("REDUCED_SIGNAL_CAPTURE")

    if motion_status == "denied":
        gtrs += 0.12
        top_signals.append("MOTION_PERMISSION_DENIED")
    elif motion_status in {"unsupported", "unavailable"}:
        gtrs += 0.05
        top_signals.append("LOW_MOTION_COVERAGE")

    if not secure_context:
        gtrs += 0.14
        top_signals.append("INSECURE_CONTEXT")

    if keypress_sample_count < 8:
        gtrs += 0.08
        top_signals.append("SPARSE_KEYPRESS_SIGNAL")

    if not device:
        gtrs += 0.08
        top_signals.append("DEVICE_CONTEXT_MISSING")

    bms = round(clamp01(bms), 4)
    gmrs = round(clamp01(gmrs), 4)
    gtrs = round(clamp01(gtrs), 4)
    unified_risk = round(
        clamp01((1 - bms) * 0.35 + gmrs * 0.25 + gtrs * 0.40),
        4,
    )

    decision = "APPROVE"
    if unified_risk >= 0.68 or (
        geo_distance_km is not None and geo_distance_km >= 1500 and amount >= 75000
    ):
        decision = "FREEZE"
    elif unified_risk >= 0.4:
        decision = "RISKED"

    unique_signals = []
    for signal in top_signals:
        if signal not in unique_signals:
            unique_signals.append(signal)

    if not unique_signals:
        unique_signals = ["NO_SIGNALS"]

    return {
        "decision": decision,
        "bms": bms,
        "gmrs": gmrs,
        "gtrs": gtrs,
        "risk_prob": unified_risk,
        "unified_risk": unified_risk,
        "top_signals": unique_signals[:5],
        "reason": build_reason(decision, unique_signals[:5], unified_risk),
        "geo_distance_km": geo_distance_km,
        "device_platform": device_platform,
        "touch_capable": touch_capable,
        "secure_context": secure_context,
        "device_fingerprint": device_fingerprint,
        "motion_capture_status": motion_status,
        "motion_sample_count": motion_sample_count,
        "keypress_sample_count": keypress_sample_count,
        "capture_mode": capture_mode,
        "typing_speed": typing_speed,
        "swipe_steadiness": swipe_steadiness,
    }


def response(status_code, payload):
    return {
        "statusCode": status_code,
        "headers": {
            # AWS Lambda Function URL CORS settings should add the CORS headers.
            # Returning them here as well causes duplicate Access-Control-Allow-Origin values.
            "Content-Type": "application/json",
        },
        "body": json.dumps(payload, default=decimal_to_native),
    }


def list_model_files():
    objects = []
    continuation_token = None

    while True:
        kwargs = {
            "Bucket": BUCKET_NAME,
            "Prefix": MODEL_PREFIX
        }
        if continuation_token:
            kwargs["ContinuationToken"] = continuation_token

        s3_response = s3.list_objects_v2(**kwargs)

        for obj in s3_response.get("Contents", []):
            objects.append({
                "key": obj["Key"],
                "size": obj["Size"],
                "last_modified": obj["LastModified"].isoformat()
            })

        if s3_response.get("IsTruncated"):
            continuation_token = s3_response.get("NextContinuationToken")
        else:
            break

    return objects


def lambda_handler(event, context):
    method = (
        event.get("httpMethod")
        or event.get("requestContext", {}).get("http", {}).get("method")
        or "GET"
    ).upper()

    path = (
        event.get("rawPath")
        or event.get("path")
        or "/"
    )

    if method == "OPTIONS":
        return response(200, {"ok": True})

    # Health check
    if method == "GET" and path in ["/", "/health"]:
        return response(200, {
            "message": "GuardianAI backend is working",
            "table": TABLE_NAME,
            "bucket": BUCKET_NAME,
            "model_prefix": MODEL_PREFIX,
            "frontend_origin": FRONTEND_ORIGIN
        })

    # List model files from S3
    if method == "GET" and path == "/models":
        try:
            files = list_model_files()
            return response(200, {
                "bucket": BUCKET_NAME,
                "prefix": MODEL_PREFIX,
                "files": files
            })
        except Exception as e:
            return response(500, {"error": str(e)})

    # Ingest a transfer event and persist the scored result
    if method == "POST" and path == "/ingest":
        try:
            raw_body = event.get("body") or "{}"
            body = json.loads(raw_body) if isinstance(raw_body, str) else raw_body

            event_id = str(body.get("event_id") or "").strip()
            user_id = str(body.get("user_id") or "").strip()

            if not event_id:
                return response(400, {"error": "event_id is required"})
            if not user_id:
                return response(400, {"error": "user_id is required"})

            timestamp = now_iso()
            historical_events = list_events_for_user(user_id)
            scored = score_ingest_payload(body, historical_events)

            item = {
                "event_id": event_id,
                "user_id": user_id,
                "amount": round(max(0.0, number_or_default(body.get("amount"), 0.0)), 2),
                "timestamp": timestamp,
                "decision": scored["decision"],
                "backend_decision": scored["decision"],
                "review_decision": scored["decision"],
                "review_source": "BACKEND_AUTO",
                "reason": scored["reason"],
                "bms": scored["bms"],
                "gmrs": scored["gmrs"],
                "gtrs": scored["gtrs"],
                "risk_prob": scored["risk_prob"],
                "unified_risk": scored["unified_risk"],
                "top_signals": scored["top_signals"],
                "capture_mode": scored["capture_mode"],
                "device_platform": scored["device_platform"],
                "touch_capable": scored["touch_capable"],
                "secure_context": scored["secure_context"],
                "device_fingerprint": scored["device_fingerprint"],
                "motion_capture_status": scored["motion_capture_status"],
                "motion_sample_count": scored["motion_sample_count"],
                "typing_speed": scored["typing_speed"],
                "swipe_steadiness": scored["swipe_steadiness"],
                "motion_permission_state": str(body.get("motion_permission_state") or "unknown"),
                "session": body.get("session") if isinstance(body.get("session"), dict) else {},
            }

            if isinstance(body.get("geo"), dict):
                lat = number_or_default(body["geo"].get("lat"), None)
                lng = number_or_default(body["geo"].get("lng"), None)
                if lat is not None and lng is not None:
                    item["geo"] = {
                        "lat": lat,
                        "lng": lng,
                        "accuracy": number_or_default(body["geo"].get("accuracy"), 0.0),
                        "timestamp": integer_or_default(body["geo"].get("timestamp"), 0),
                    }

            if scored["geo_distance_km"] is not None:
                item["geo_distance_km"] = scored["geo_distance_km"]

            if isinstance(body.get("device"), dict):
                item["device"] = body["device"]

            table.put_item(Item=to_dynamodb_native(item))
            return response(200, item)

        except Exception as e:
            return response(500, {"error": str(e)})

    # Get all events from DynamoDB
    if method == "GET" and path == "/events":
        try:
            scan_response = table.scan()
            items = scan_response.get("Items", [])

            while "LastEvaluatedKey" in scan_response:
                scan_response = table.scan(
                    ExclusiveStartKey=scan_response["LastEvaluatedKey"]
                )
                items.extend(scan_response.get("Items", []))

            items.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
            return response(200, items)

        except Exception as e:
            return response(500, {"error": str(e)})

    # Delete all events from DynamoDB
    if method == "DELETE" and path == "/events":
        try:
            key_names = [entry["AttributeName"] for entry in table.key_schema]
            if not key_names:
                return response(500, {"error": "Unable to determine DynamoDB key schema"})

            attr_names = {f"#k{i}": name for i, name in enumerate(key_names)}
            scan_kwargs = {
                "ProjectionExpression": ", ".join(attr_names.keys()),
                "ExpressionAttributeNames": attr_names,
            }

            cleared = 0
            with table.batch_writer() as batch:
                while True:
                    scan_response = table.scan(**scan_kwargs)
                    for item in scan_response.get("Items", []):
                        key = {name: item[name] for name in key_names if name in item}
                        if len(key) == len(key_names):
                            batch.delete_item(Key=key)
                            cleared += 1

                    last_key = scan_response.get("LastEvaluatedKey")
                    if not last_key:
                        break
                    scan_kwargs["ExclusiveStartKey"] = last_key

            return response(200, {
                "message": f"Cleared {cleared} transactions.",
                "cleared": cleared,
            })

        except Exception as e:
            return response(500, {"error": str(e)})

    # Update event decision in DynamoDB
    if method == "PATCH" and path == "/events":
        try:
            raw_body = event.get("body") or "{}"
            body = json.loads(raw_body) if isinstance(raw_body, str) else raw_body

            event_id = str(body.get("event_id", "")).strip()
            decision = str(body.get("decision") or body.get("review_decision") or "").upper().strip()
            backend_decision = str(body.get("backend_decision", "")).upper().strip()
            review_source = str(body.get("review_source", "MANUAL_REVIEW")).strip()
            review_updated_at = str(body.get("review_updated_at", "")).strip()

            if not event_id:
                return response(400, {"error": "event_id is required"})

            if decision not in {"APPROVE", "RISKED", "FREEZE"}:
                return response(400, {"error": "decision must be APPROVE, RISKED, or FREEZE"})

            update_expression = [
                "#decision = :decision",
                "#review_decision = :review_decision",
                "#review_source = :review_source",
            ]
            expr_attr_names = {
                "#decision": "decision",
                "#review_decision": "review_decision",
                "#review_source": "review_source",
            }
            expr_attr_values = {
                ":decision": decision,
                ":review_decision": decision,
                ":review_source": review_source,
            }

            if backend_decision in {"APPROVE", "RISKED", "FREEZE"}:
                update_expression.append("#backend_decision = :backend_decision")
                expr_attr_names["#backend_decision"] = "backend_decision"
                expr_attr_values[":backend_decision"] = backend_decision

            if review_updated_at:
                update_expression.append("#review_updated_at = :review_updated_at")
                expr_attr_names["#review_updated_at"] = "review_updated_at"
                expr_attr_values[":review_updated_at"] = review_updated_at

            result = table.update_item(
                Key={"event_id": event_id},
                UpdateExpression="SET " + ", ".join(update_expression),
                ExpressionAttributeNames=expr_attr_names,
                ExpressionAttributeValues=expr_attr_values,
                ReturnValues="ALL_NEW",
            )

            return response(200, {
                "message": f"Updated review decision for {event_id}",
                "item": result.get("Attributes", {}),
            })

        except Exception as e:
            return response(500, {"error": str(e)})

    return response(405, {"error": f"Unsupported route or method: {method} {path}"})
