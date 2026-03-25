import json
import boto3
from decimal import Decimal

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table("guardian_ai_events")


def decimal_to_native(obj):
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    raise TypeError


def response(status_code, payload):
    return {
        "statusCode": status_code,
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Methods": "GET,DELETE,PATCH,OPTIONS",
            "Content-Type": "application/json",
        },
        "body": json.dumps(payload, default=decimal_to_native),
    }


def lambda_handler(event, context):
    method = (
        event.get("httpMethod")
        or event.get("requestContext", {}).get("http", {}).get("method")
        or "GET"
    ).upper()

    if method == "OPTIONS":
        return response(200, {"ok": True})

    if method == "GET":
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

    if method == "DELETE":
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

    if method == "PATCH":
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

    return response(405, {"error": f"Unsupported method: {method}"})
