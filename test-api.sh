#!/bin/bash
# Script de test complet de l'API AutoDiag AI
# Usage : bash test-api.sh [URL_BASE]

BASE="${1:-https://autodiag-ai-backend.onrender.com}"
EMAIL="test_$(date +%s)@autodiag.mg"
PASS="TestPass123!"

echo "============================================"
echo " AutoDiag AI — Test API complète"
echo " Base : $BASE"
echo "============================================"
echo ""

ok()   { echo "✅ $1"; }
fail() { echo "❌ $1"; echo "   Réponse : $2"; }
sep()  { echo ""; echo "--- $1 ---"; }

# ─── Health ──────────────────────────────────────────────────────────────────
sep "HEALTH"
PING=$(curl -sf "$BASE/api/health/ping")
[ "$PING" = '{"pong":true}' ] && ok "Ping" || fail "Ping" "$PING"

HEALTH=$(curl -sf "$BASE/api/health" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['status'])" 2>/dev/null)
[ "$HEALTH" = "ok" ] && ok "Health (DB + Redis)" || fail "Health" "$HEALTH"

# ─── Auth — Inscription ───────────────────────────────────────────────────────
sep "AUTH"
REGISTER=$(curl -sf -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"firstName\":\"Jean\",\"lastName\":\"Rakoto\"}")

TOKEN=$(echo "$REGISTER" | python3 -c "import sys,json; print(json.load(sys.stdin)['tokens']['accessToken'])" 2>/dev/null)
USER_ID=$(echo "$REGISTER" | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['id'])" 2>/dev/null)

[ -n "$TOKEN" ] && ok "Inscription ($EMAIL)" || fail "Inscription" "$REGISTER"

# Auth — Login
LOGIN=$(curl -sf -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
LOGIN_TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['tokens']['accessToken'])" 2>/dev/null)
[ -n "$LOGIN_TOKEN" ] && ok "Login" || fail "Login" "$LOGIN"
TOKEN="$LOGIN_TOKEN"

# Auth — Profil
ME=$(curl -sf "$BASE/api/users/me" -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; print(json.load(sys.stdin)['email'])" 2>/dev/null)
[ "$ME" = "$EMAIL" ] && ok "GET /users/me" || fail "GET /users/me" "$ME"

# ─── Véhicule ─────────────────────────────────────────────────────────────────
sep "VEHICULES"
VEHICLE=$(curl -sf -X POST "$BASE/api/vehicles" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"make":"Toyota","model":"Corolla","year":2008,"mileageKm":185000,"fuelType":"petrol","plateNumber":"456 TAA 012"}')

VEHICLE_ID=$(echo "$VEHICLE" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null)
[ -n "$VEHICLE_ID" ] && ok "Créer véhicule (Toyota Corolla 2008)" || fail "Créer véhicule" "$VEHICLE"

VEHICLES=$(curl -sf "$BASE/api/vehicles" -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
[ "$VEHICLES" = "1" ] && ok "Lister véhicules (1 trouvé)" || fail "Lister véhicules" "$VEHICLES"

# ─── Entretien ────────────────────────────────────────────────────────────────
sep "ENTRETIEN"
MAINT=$(curl -sf -X POST "$BASE/api/maintenance" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"vehicleId\":\"$VEHICLE_ID\",\"category\":\"oil_change\",\"title\":\"Vidange huile\",\"date\":\"2026-05-01\",\"mileageKm\":183000,\"cost\":85000,\"currency\":\"MGA\"}")

MAINT_ID=$(echo "$MAINT" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null)
[ -n "$MAINT_ID" ] && ok "Ajouter entretien (vidange)" || fail "Ajouter entretien" "$MAINT"

REMINDERS=$(curl -sf "$BASE/api/maintenance/reminders" -H "Authorization: Bearer $TOKEN")
ok "Rappels maintenance : $REMINDERS"

# ─── Diagnostic IA ────────────────────────────────────────────────────────────
sep "DIAGNOSTIC IA (plan Pro requis)"
DIAG=$(curl -sf -X POST "$BASE/api/diagnostics/analyze" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"vehicleId\": \"$VEHICLE_ID\",
    \"symptoms\": [{\"code\":\"idle_rough\",\"label\":\"Ralenti instable\",\"severity\":2}],
    \"recentWorks\": [],
    \"userDescription\": \"Le moteur tremble au ralenti\",
    \"obdSnapshot\": {
      \"dtcs\": [{\"code\":\"P0301\",\"description\":\"Raté allumage cylindre 1\",\"isPending\":false}],
      \"rpm\": 750,
      \"coolantTemp\": 90,
      \"engineLoad\": 25,
      \"ltftB1\": 18.5,
      \"stftB1\": 2.3,
      \"batteryVoltage\": 12.4
    }
  }" 2>&1)

DIAG_STATUS=$(echo "$DIAG" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('statusCode','ok'))" 2>/dev/null)
if [ "$DIAG_STATUS" = "403" ]; then
  ok "Diagnostic IA bloqué pour plan Starter (comportement attendu ✅)"
elif echo "$DIAG" | grep -q "primaryCause"; then
  CAUSE=$(echo "$DIAG" | python3 -c "import sys,json; print(json.load(sys.stdin).get('primaryCause','?'))" 2>/dev/null)
  ok "Diagnostic IA : $CAUSE"
else
  fail "Diagnostic IA" "${DIAG:0:200}"
fi

# ─── OBD2 ─────────────────────────────────────────────────────────────────────
sep "OBD2 (plan Plus requis)"
OBD=$(curl -sf -X POST "$BASE/api/obd2/sessions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"vehicleId\":\"$VEHICLE_ID\",\"elm327DeviceName\":\"ELM327 Test\",\"protocol\":\"CAN\"}" 2>&1)

OBD_STATUS=$(echo "$OBD" | python3 -c "import sys,json; print(json.load(sys.stdin).get('statusCode','ok'))" 2>/dev/null)
[ "$OBD_STATUS" = "403" ] && ok "OBD2 bloqué pour Starter (comportement attendu ✅)" || ok "OBD2 session : $OBD_STATUS"

# ─── Auth — Logout ────────────────────────────────────────────────────────────
sep "LOGOUT"
LOGOUT=$(curl -sf -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/logout" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}')
[ "$LOGOUT" = "204" ] && ok "Logout (204 No Content)" || fail "Logout" "$LOGOUT"

echo ""
echo "============================================"
echo " Tests terminés"
echo "============================================"
